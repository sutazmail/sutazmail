/**
 * E2E helper CLI — exercises the REAL getRules/setRules code path the portal uses,
 * so mail-flow tests configure rules exactly as the app does. Not used by the app.
 *   npx tsx scripts/set-rules-cli.ts get <mailbox>
 *   npx tsx scripts/set-rules-cli.ts set <mailbox> '<rules-json>'
 */
import { getRules, setRules, type MailboxRules } from "../src/server/sieve-rules";

const [, , op, mailbox, json] = process.argv;
if (!op || !mailbox) {
  console.error("usage: set-rules-cli.ts <get|set> <mailbox> [json]");
  process.exit(2);
}

if (op === "get") {
  console.log(JSON.stringify(await getRules(mailbox)));
} else if (op === "set") {
  if (!json) throw new Error("set needs a rules JSON argument");
  const saved = await setRules(mailbox, JSON.parse(json) as MailboxRules);
  console.log(JSON.stringify(saved));
} else if (op === "ar") {
  // Replicates setAutoresponderAction exactly: read current (imports any existing
  // forward), enable the autoresponder, and persist — proving forwarding survives.
  const current = await getRules(mailbox);
  const [days, subject, message] = [json ?? "1", process.argv[5] ?? "Away", process.argv[6] ?? "away"];
  const saved = await setRules(mailbox, {
    ...current,
    autoresponder: { enabled: true, days: Number(days), subject, message },
  });
  console.log(JSON.stringify(saved));
} else {
  throw new Error(`unknown op ${op}`);
}
process.exit(0);
