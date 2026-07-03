/**
 * Domain views for the admin console. Postgres (Org/Domain) is the tenancy source of
 * truth; the mailserver supplies live mailbox counts + the DKIM record. DNS records
 * come from dns-records.ts: Settings templates until a domain is customized, then its
 * own editable DnsRecord rows.
 */
import { prisma } from "./db";
import { listAccounts, readDkim, removeDkim } from "./mailserver";
import { getDomainDns } from "./dns-records";
import { assertDomain } from "./validate";
import type { EditableDnsRecord } from "@/lib/dns";

export type { EditableDnsRecord };

export interface ManagedDomain {
  name: string;
  org: string;
  mailboxes: number;
  dkim: string | null;
  dnsCustomized: boolean;
  dns: EditableDnsRecord[];
}

export async function listManagedDomains(): Promise<ManagedDomain[]> {
  const [domains, accounts] = await Promise.all([
    prisma.domain.findMany({ include: { org: true }, orderBy: { name: "asc" } }),
    listAccounts().catch(() => []),
  ]);

  const counts = new Map<string, number>();
  for (const a of accounts) counts.set(a.domain, (counts.get(a.domain) ?? 0) + 1);

  return Promise.all(
    domains.map(async (d) => {
      const dns = await getDomainDns(d.name);
      return {
        name: d.name,
        org: d.org?.name ?? "—",
        mailboxes: counts.get(d.name) ?? 0,
        dkim: await readDkim(d.name).catch(() => null),
        dnsCustomized: dns.customized,
        dns: dns.records,
      };
    }),
  );
}

/**
 * Delete a managed domain: refuses if the mail server still has mailboxes under it
 * (never orphan real mailboxes), then removes the Domain row (its DnsRecord rows cascade),
 * deletes the domain's DKIM key files, and cleans up the owning Org if it is now empty.
 * Published DNS at the registrar is the operator's to remove — we only drop our records.
 */
export async function deleteManagedDomain(name: string): Promise<void> {
  const domainName = name.trim().toLowerCase();
  assertDomain(domainName);

  const domain = await prisma.domain.findUnique({ where: { name: domainName } });
  if (!domain) throw new Error("Domain not found");

  const accounts = await listAccounts().catch(() => []);
  const mailboxes = accounts.filter((a) => a.domain === domainName).length;
  if (mailboxes > 0) {
    throw new Error(
      `Remove its ${mailboxes} mailbox${mailboxes === 1 ? "" : "es"} before deleting the domain`,
    );
  }

  await prisma.domain.delete({ where: { id: domain.id } });
  await removeDkim(domainName);

  // Tidy up a now-empty tenant org (the seeded orgs always keep users, so are never removed).
  const [remainingDomains, remainingUsers] = await Promise.all([
    prisma.domain.count({ where: { orgId: domain.orgId } }),
    prisma.user.count({ where: { orgId: domain.orgId } }),
  ]);
  if (remainingDomains === 0 && remainingUsers === 0) {
    await prisma.org.delete({ where: { id: domain.orgId } }).catch(() => undefined);
  }
}
