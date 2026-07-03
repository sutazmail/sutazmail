/**
 * P1 rules E2E — run INSIDE the sutazmail-v2 container against the LIVE mailserver:
 *   npx tsx scripts/e2e-rules.ts <mailbox>
 *
 * Proves the self-service autoresponder + forwarding actually land on the mail server:
 * setRules writes a managed Sieve script via the Dovecot master account, getRules reads
 * it back, and Dovecot reports our script as the ACTIVE one containing the expected
 * vacation + redirect commands. Leaves the managed script in place (harmless); the
 * throwaway mailbox is removed by the caller.
 */
import { setRules, getRules } from "../src/server/sieve-rules";
import { openMasterSieve } from "../src/server/sieve";

const [, , mailbox] = process.argv;
if (!mailbox) {
  console.error("usage: tsx scripts/e2e-rules.ts <mailbox>");
  process.exit(2);
}

let failures = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failures++;
}

const desired = {
  forwarding: { enabled: true, to: "forward-target@sutaz.ca", keepCopy: true },
  autoresponder: {
    enabled: true,
    days: 3,
    subject: "On vacation",
    message: "Away until Monday.",
  },
};

const saved = await setRules(mailbox, desired);
check("setRules validated + persisted forwarding target", saved.forwarding.to === "forward-target@sutaz.ca");

const read = await getRules(mailbox);
check("getRules round-trips autoresponder", read.autoresponder.enabled && read.autoresponder.days === 3);
check("getRules round-trips forwarding", read.forwarding.enabled && read.forwarding.keepCopy);

const c = await openMasterSieve(mailbox);
try {
  const scripts = await c.listScripts();
  const active = scripts.find((s) => s.active);
  check(`Dovecot active script is "sutazmail" (got ${active?.name ?? "none"})`, active?.name === "sutazmail");
  const body = await c.getScript("sutazmail");
  check("active script contains vacation command", !!body && /vacation :days 3/.test(body));
  check("active script contains redirect command", !!body && /redirect :copy "forward-target@sutaz\.ca"/.test(body));
} finally {
  await c.logout();
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL RULES E2E CHECKS PASSED");
process.exit(failures ? 1 : 0);
