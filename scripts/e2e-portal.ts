/**
 * P1 portal-journey E2E — run INSIDE the sutazmail-v2 container against the LIVE
 * mailserver + Postgres (no mocks). Exercises the real password-change journey a
 * mailbox owner performs, through the same server modules the portal action uses:
 *
 *   npx tsx scripts/e2e-portal.ts <mailbox> <currentPassword>
 *
 * 1. Current password verifies against Dovecot (the action's pre-check).
 * 2. `setup email update` sets a new password (the action's mutation).
 * 3. New password authenticates; old password no longer does (round-trip proof).
 * 4. An audit row is written and read back from Postgres.
 * 5. Password is restored to the original so the mailbox is left unchanged.
 */
import { verifyMailboxCredentials } from "../src/server/sieve";
import { updateAccountPassword } from "../src/server/mailserver";
import { audit } from "../src/server/audit";
import { prisma } from "../src/server/db";

const [, , mailbox, current] = process.argv;
if (!mailbox || !current) {
  console.error("usage: tsx scripts/e2e-portal.ts <mailbox> <currentPassword>");
  process.exit(2);
}
const next = `Chg-${current}-9`;

let failures = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failures++;
}

const user = await prisma.user.findUnique({ where: { email: mailbox } });
check("portal user row exists in Postgres", !!user);

check("step1: current password verifies (Dovecot)", (await verifyMailboxCredentials(mailbox, current)) === true);

await updateAccountPassword(mailbox, next);
// allow Dovecot passdb to pick up the change
await new Promise((r) => setTimeout(r, 3000));

check("step3: NEW password authenticates", (await verifyMailboxCredentials(mailbox, next)) === true);
check("step3: OLD password now rejected", (await verifyMailboxCredentials(mailbox, current)) === false);

const before = await prisma.auditLog.count({ where: { action: "mailbox.password.change", target: mailbox } });
await audit("mailbox.password.change", mailbox, { orgId: user?.orgId, actorId: user?.id, detail: { via: "e2e" } });
const after = await prisma.auditLog.count({ where: { action: "mailbox.password.change", target: mailbox } });
check("step4: audit row written + read back from Postgres", after === before + 1);

// restore original so the throwaway mailbox is left as created
await updateAccountPassword(mailbox, current);
await new Promise((r) => setTimeout(r, 3000));
check("step5: password restored to original", (await verifyMailboxCredentials(mailbox, current)) === true);

await prisma.$disconnect();
console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PORTAL JOURNEY CHECKS PASSED");
process.exit(failures ? 1 : 0);
