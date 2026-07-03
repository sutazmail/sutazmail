"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/session";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { hashPassword, verifyPassword } from "@/server/auth";
import { updateAccountPassword } from "@/server/mailserver";
import { assertPassword } from "@/server/validate";
import { verifyMailboxCredentials, SieveConnectionError } from "@/server/sieve";
import { getRules, setRules, type MailboxRules } from "@/server/sieve-rules";
import { withKeyedLock } from "@/server/mutex";

export type PasswordState = { error?: string; ok?: boolean };
export type RulesState = { error?: string; ok?: boolean };

const UNREACHABLE = "Mail server is unreachable right now. Try again shortly.";

/**
 * Change your OWN password. Mailbox owners (role USER) authenticate the current
 * password against Dovecot, then the new password is set on the mail server. Admins
 * (SUPERADMIN/ORG_ADMIN) have a local bcrypt credential, checked + updated in our DB.
 */
export async function changeOwnPasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const ctx = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current || !next) return { error: "All fields are required" };
  if (next !== confirm) return { error: "New passwords do not match" };
  try {
    assertPassword(next);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Invalid new password" };
  }

  if (ctx.user.role === "USER") {
    try {
      if (!(await verifyMailboxCredentials(ctx.user.email, current))) {
        return { error: "Current password is incorrect" };
      }
    } catch (err) {
      if (err instanceof SieveConnectionError) {
        console.error("[portal] mailserver unreachable:", err.message);
        return { error: UNREACHABLE };
      }
      throw err;
    }
    await updateAccountPassword(ctx.user.email, next);
  } else {
    if (!(await verifyPassword(current, ctx.user.passwordHash))) {
      return { error: "Current password is incorrect" };
    }
    await prisma.user.update({
      where: { id: ctx.user.id },
      data: { passwordHash: await hashPassword(next) },
    });
  }

  await audit("account.password.change", ctx.user.email, {
    orgId: ctx.user.orgId,
    actorId: ctx.user.id,
    detail: { role: ctx.user.role },
  });
  return { ok: true };
}

/**
 * Merge one feature's submitted values into the mailbox's current rules and persist,
 * so editing the autoresponder never clobbers forwarding (and vice-versa). USER only.
 */
async function saveFeature(
  action: string,
  merge: (current: MailboxRules, fd: FormData) => MailboxRules,
  formData: FormData,
): Promise<RulesState> {
  const ctx = await requireUser();
  if (ctx.user.role !== "USER") {
    return { error: "Only mailbox accounts have autoresponder and forwarding." };
  }
  try {
    // Serialize read-modify-write per mailbox so concurrent saves can't lose an update.
    await withKeyedLock(ctx.user.email, async () => {
      const current = await getRules(ctx.user.email);
      await setRules(ctx.user.email, merge(current, formData));
    });
  } catch (err) {
    if (err instanceof SieveConnectionError) {
      console.error("[portal] sieve unreachable:", err.message);
      return { error: UNREACHABLE };
    }
    return { error: err instanceof Error ? err.message : "Could not save settings" };
  }
  await audit(action, ctx.user.email, { orgId: ctx.user.orgId, actorId: ctx.user.id });
  revalidatePath("/portal/autoresponder");
  revalidatePath("/portal/forwarding");
  return { ok: true };
}

export async function setAutoresponderAction(_prev: RulesState, formData: FormData): Promise<RulesState> {
  return saveFeature(
    "mailbox.autoresponder.update",
    (current, fd) => ({
      ...current,
      autoresponder: {
        enabled: fd.get("ar_enabled") === "on",
        days: Number(fd.get("ar_days") ?? 7),
        subject: String(fd.get("ar_subject") ?? ""),
        message: String(fd.get("ar_message") ?? ""),
      },
    }),
    formData,
  );
}

export async function setForwardingAction(_prev: RulesState, formData: FormData): Promise<RulesState> {
  return saveFeature(
    "mailbox.forwarding.update",
    (current, fd) => ({
      ...current,
      forwarding: {
        enabled: fd.get("fwd_enabled") === "on",
        to: String(fd.get("fwd_to") ?? ""),
        keepCopy: fd.get("fwd_keepCopy") === "on",
      },
    }),
    formData,
  );
}
