/**
 * Domain views for the admin console. Postgres (Org/Domain) is the tenancy source of
 * truth; the mailserver supplies live mailbox counts + the DKIM record. DNS records
 * come from dns-records.ts: Settings templates until a domain is customized, then its
 * own editable DnsRecord rows.
 */
import { prisma } from "./db";
import { listAccounts, readDkim } from "./mailserver";
import { getDomainDns } from "./dns-records";
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
