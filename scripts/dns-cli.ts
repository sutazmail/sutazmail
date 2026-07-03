/**
 * E2E helper CLI for per-domain DNS record CRUD — exercises the same server module the
 * DNS record actions use (dns-records.ts), so tests can verify fork-from-template,
 * add/update/delete, and reset against the real database. Not used by the app.
 *   npx tsx scripts/dns-cli.ts get <domain>
 *   npx tsx scripts/dns-cli.ts add <domain> <type> <host> <value>
 *   npx tsx scripts/dns-cli.ts set <domain> <recordId|tpl:N> <type> <host> <value>
 *   npx tsx scripts/dns-cli.ts del <domain> <recordId|tpl:N>
 *   npx tsx scripts/dns-cli.ts reset <domain>
 */
import { prisma } from "../src/server/db";
import {
  addDnsRecord,
  deleteDnsRecord,
  getDomainDns,
  resetDnsRecords,
  updateDnsRecord,
} from "../src/server/dns-records";

const [, , op, domain, ...rest] = process.argv;
if (!domain) throw new Error("usage: get|add|set|del|reset <domain> ...");

if (op === "get") {
  console.log(JSON.stringify(await getDomainDns(domain), null, 2));
} else if (op === "add") {
  const [type, host, value] = rest;
  await addDnsRecord(domain, { type, host, value });
  console.log("ADDED");
} else if (op === "set") {
  const [id, type, host, value] = rest;
  await updateDnsRecord(domain, id, { type, host, value });
  console.log("UPDATED");
} else if (op === "del") {
  await deleteDnsRecord(domain, rest[0]);
  console.log("DELETED");
} else if (op === "reset") {
  await resetDnsRecords(domain);
  console.log("RESET");
} else {
  throw new Error("usage: get|add|set|del|reset");
}

await prisma.$disconnect();
process.exit(0);
