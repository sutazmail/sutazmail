/**
 * E2E helper for the Settings store — get/set via the real settings module so a test
 * can verify persistence + that consumers (DNS templates, email-app profile) reflect
 * changes. Not used by the app.
 *   npx tsx scripts/settings-cli.ts get
 *   npx tsx scripts/settings-cli.ts set <field> <value>
 */
import { getSettings, setSettings, type AppSettings } from "../src/server/settings";
import { prisma } from "../src/server/db";

const [, , op, field, value] = process.argv;

if (op === "get") {
  console.log(JSON.stringify(await getSettings(), null, 2));
} else if (op === "set") {
  if (!field) throw new Error("set needs <field> <value>");
  await setSettings({ [field]: value } as Partial<AppSettings>);
  console.log("SET " + field + "=" + value);
} else {
  throw new Error("usage: get | set <field> <value>");
}

await prisma.$disconnect();
process.exit(0);
