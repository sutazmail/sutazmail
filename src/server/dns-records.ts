/**
 * Per-domain editable DNS records. A domain follows the global Settings templates
 * (settings.ts dnsRecordsFor) until its first record mutation, which forks the current
 * templates into DnsRecord rows ("customized"); from then on records are managed
 * per-row. resetDnsRecords deletes the rows and returns the domain to the templates.
 *
 * Template-backed records are addressed with synthetic ids "tpl:<index>" so the UI can
 * edit/delete them before the fork exists; mutations resolve those ids atomically.
 */
import { prisma } from "./db";
import { getSettings, dnsRecordsFor } from "./settings";
import { canonicalType, validateDnsInput, type EditableDnsRecord } from "@/lib/dns";

export type { EditableDnsRecord };

export interface DomainDns {
  customized: boolean;
  records: EditableDnsRecord[];
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function requireDomain(tx: Tx, name: string) {
  const domain = await tx.domain.findUnique({ where: { name } });
  if (!domain) throw new Error(`Unknown domain ${name}`);
  return domain;
}

/**
 * Fork the current templates into rows (idempotent) and return the domain's rows
 * ordered by position — so "tpl:<n>" resolves to the row seeded from template n.
 */
async function ensureCustomized(tx: Tx, domainId: string, domainName: string, customized: boolean) {
  if (!customized) {
    const templates = dnsRecordsFor(domainName, await getSettings());
    await tx.dnsRecord.createMany({
      data: templates.map((t, i) => ({
        domainId,
        type: canonicalType(t.type),
        host: t.host,
        value: t.value,
        position: i,
      })),
    });
    await tx.domain.update({ where: { id: domainId }, data: { dnsCustomized: true } });
  }
  return tx.dnsRecord.findMany({ where: { domainId }, orderBy: { position: "asc" } });
}

async function resolveRecordId(tx: Tx, domainName: string, recordId: string): Promise<string> {
  const domain = await requireDomain(tx, domainName);
  const rows = await ensureCustomized(tx, domain.id, domain.name, domain.dnsCustomized);
  if (recordId.startsWith("tpl:")) {
    const row = rows[Number(recordId.slice(4))];
    if (!row) throw new Error("Record not found");
    return row.id;
  }
  if (!rows.some((r) => r.id === recordId)) throw new Error("Record not found");
  return recordId;
}

export async function getDomainDns(domainName: string): Promise<DomainDns> {
  const domain = await prisma.domain.findUnique({
    where: { name: domainName },
    include: { dnsRecords: { orderBy: { position: "asc" } } },
  });
  if (!domain) throw new Error(`Unknown domain ${domainName}`);
  if (!domain.dnsCustomized) {
    const templates = dnsRecordsFor(domainName, await getSettings());
    return { customized: false, records: templates.map((t, i) => ({ id: `tpl:${i}`, ...t })) };
  }
  return {
    customized: true,
    records: domain.dnsRecords.map((r) => ({ id: r.id, type: r.type, host: r.host, value: r.value })),
  };
}

export async function addDnsRecord(
  domainName: string,
  input: { type: string; host: string; value: string },
): Promise<void> {
  const rec = validateDnsInput(input);
  await prisma.$transaction(async (tx) => {
    const domain = await requireDomain(tx, domainName);
    const rows = await ensureCustomized(tx, domain.id, domain.name, domain.dnsCustomized);
    const position = rows.length ? Math.max(...rows.map((r) => r.position)) + 1 : 0;
    await tx.dnsRecord.create({ data: { domainId: domain.id, ...rec, position } });
  });
}

export async function updateDnsRecord(
  domainName: string,
  recordId: string,
  input: { type: string; host: string; value: string },
): Promise<void> {
  const rec = validateDnsInput(input);
  await prisma.$transaction(async (tx) => {
    const id = await resolveRecordId(tx, domainName, recordId);
    await tx.dnsRecord.update({ where: { id }, data: rec });
  });
}

export async function deleteDnsRecord(domainName: string, recordId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const id = await resolveRecordId(tx, domainName, recordId);
    await tx.dnsRecord.delete({ where: { id } });
  });
}

/** Drop all custom rows; the domain follows the global templates again. */
export async function resetDnsRecords(domainName: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const domain = await requireDomain(tx, domainName);
    await tx.dnsRecord.deleteMany({ where: { domainId: domain.id } });
    await tx.domain.update({ where: { id: domain.id }, data: { dnsCustomized: false } });
  });
}
