/**
 * E2E helper CLI for the add-domain flow — runs the same operations addDomainAction
 * uses, so a mail-flow test can verify DKIM generation + the managed-domain view and
 * then clean up. Not used by the app.
 *   npx tsx scripts/domain-cli.ts add <domain> [org]
 *   npx tsx scripts/domain-cli.ts dkim <domain>
 *   npx tsx scripts/domain-cli.ts list
 *   npx tsx scripts/domain-cli.ts del <domain>   # DB rows only
 */
import { prisma } from "../src/server/db";
import { generateDkim, readDkim } from "../src/server/mailserver";
import { listManagedDomains } from "../src/server/domains";

const [, , op, name, org] = process.argv;

if (op === "add") {
  if (!name) throw new Error("add needs a domain");
  const o = await prisma.org.upsert({
    where: { slug: name },
    update: {},
    create: { slug: name, name: org || name },
  });
  await prisma.domain.upsert({ where: { name }, update: {}, create: { name, orgId: o.id } });
  await generateDkim(name);
  console.log("ADDED " + name);
} else if (op === "dkim") {
  console.log(await readDkim(name));
} else if (op === "list") {
  console.log(JSON.stringify(await listManagedDomains(), null, 2));
} else if (op === "del") {
  await prisma.domain.deleteMany({ where: { name } });
  await prisma.org.deleteMany({ where: { slug: name } });
  console.log("DELETED " + name);
} else {
  throw new Error("usage: add|dkim|list|del");
}

await prisma.$disconnect();
process.exit(0);
