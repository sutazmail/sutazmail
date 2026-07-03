"use server";

import { redirect } from "next/navigation";
import { authenticator } from "otplib";
import { verifyPassword } from "@/server/auth";
import { createSession, destroySession, getAuth } from "@/server/session";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { verifyMailboxCredentials, SieveConnectionError } from "@/server/sieve";

export type LoginState = { error?: string; totpRequired?: boolean };

// In-memory, per-process rate limit: max 5 failed attempts per 15 min per email.
// Single process — good enough to blunt brute force (and protect the mailserver's
// fail2ban budget) without a store.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || rec.resetAt < now) return false;
  return rec.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || rec.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    rec.count += 1;
  }
}

function clearFailures(key: string): void {
  attempts.delete(key);
}

const GENERIC_ERROR = "Invalid email or password"; // constant message, no enumeration

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const totpCode = String(formData.get("totp") ?? "").trim();

  if (!email || !password) return { error: GENERIC_ERROR };
  if (rateLimited(email)) {
    return { error: "Too many failed attempts. Try again later." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.disabledAt) {
    recordFailure(email);
    return { error: GENERIC_ERROR };
  }

  // Credential check by role: admins hold a local bcrypt hash; mailbox owners
  // authenticate against Dovecot (their real mailbox password, via ManageSieve —
  // never through the REST bridge, never logged).
  let ok = false;
  if (user.role === "USER") {
    try {
      ok = await verifyMailboxCredentials(email, password);
    } catch (err) {
      if (err instanceof SieveConnectionError) {
        console.error("[login] mailserver unreachable:", err.message);
        return { error: "Mail server is unreachable right now. Try again shortly." };
      }
      throw err;
    }
  } else {
    ok = await verifyPassword(password, user.passwordHash);
  }

  if (!ok) {
    recordFailure(email);
    return { error: GENERIC_ERROR };
  }

  if (user.totpEnabled && user.totpSecret) {
    if (!totpCode) return { totpRequired: true };
    if (!authenticator.check(totpCode, user.totpSecret)) {
      recordFailure(email);
      return { totpRequired: true, error: "Invalid authentication code" };
    }
  }

  clearFailures(email);
  await audit("session.login", email, { orgId: user.orgId, actorId: user.id });
  await createSession(user.id);
  redirect(user.role === "USER" ? "/portal" : "/");
}

export async function logoutAction(): Promise<void> {
  const ctx = await getAuth();
  if (ctx) {
    await audit("session.logout", ctx.user.email, {
      orgId: ctx.user.orgId,
      actorId: ctx.user.id,
    });
  }
  await destroySession();
  redirect("/login");
}
