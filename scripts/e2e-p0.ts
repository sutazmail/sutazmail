/**
 * P0 end-to-end probe — run INSIDE the sutazmail-v2 container against the LIVE
 * mailserver (no mocks; exercises the real src/server/sieve.ts code path):
 *
 *   npx tsx scripts/e2e-p0.ts <mailbox> <password>
 *
 * 1. Dovecot auth accepts the correct password (ManageSieve SASL PLAIN).
 * 2. Dovecot auth rejects a wrong password.
 * 3. The app's Dovecot master account can open a sieve session FOR that mailbox
 *    (authzid) and LISTSCRIPTS — proves the P1 act-on-behalf mechanism.
 */
import { verifyMailboxCredentials, openMasterSieve } from "../src/server/sieve";

const [, , mailbox, password] = process.argv;
if (!mailbox || !password) {
  console.error("usage: tsx scripts/e2e-p0.ts <mailbox> <password>");
  process.exit(2);
}

let failures = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failures++;
}

const good = await verifyMailboxCredentials(mailbox, password);
check("dovecot auth accepts correct password", good === true);

const bad = await verifyMailboxCredentials(mailbox, `${password}-wrong`);
check("dovecot auth rejects wrong password", bad === false);

try {
  const c = await openMasterSieve(mailbox);
  const scripts = await c.listScripts();
  await c.logout();
  check(`master sieve login + LISTSCRIPTS (${scripts.length} script(s))`, true);
} catch (err) {
  console.error(String(err));
  check("master sieve login", false);
}

process.exit(failures ? 1 : 0);
