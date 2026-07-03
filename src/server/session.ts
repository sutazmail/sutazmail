/**
 * DB-backed sessions + RBAC guards (v2). The cookie carries the same HMAC-signed
 * compact token as v1, but `sub` is now a Session row id — Postgres is the source
 * of truth, enabling revocation and audit. Roles: SUPERADMIN > ORG_ADMIN > USER.
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  signSession,
  verifySession,
} from "./auth";
import type { Session, User } from "../generated/prisma/client";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

export interface AuthContext {
  user: User;
  session: Session;
}

export async function createSession(userId: string): Promise<void> {
  const exp = Date.now() + SESSION_TTL_MS;
  const hdrs = await headers();
  const row = await prisma.session.create({
    data: {
      userId,
      expiresAt: new Date(exp),
      ip: (hdrs.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null,
      userAgent: hdrs.get("user-agent"),
    },
  });
  const token = signSession({ sub: row.id, exp }, secret());
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(exp),
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const payload = verifySession(store.get(SESSION_COOKIE)?.value, secret());
  if (payload) {
    await prisma.session.deleteMany({ where: { id: payload.sub } });
  }
  store.delete(SESSION_COOKIE);
}

/** Authenticated context or null — checks signature, DB row, expiry, disabled flag. */
export async function getAuth(): Promise<AuthContext | null> {
  const store = await cookies();
  const payload = verifySession(store.get(SESSION_COOKIE)?.value, secret());
  if (!payload) return null;
  const session = await prisma.session.findUnique({
    where: { id: payload.sub },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  if (session.user.disabledAt) return null;
  const { user, ...rest } = session;
  return { user, session: rest };
}

export async function requireUser(): Promise<AuthContext> {
  const ctx = await getAuth();
  if (!ctx) redirect("/login");
  return ctx;
}

/** ORG_ADMIN or SUPERADMIN; mailbox owners are bounced to their portal. */
export async function requireOrgAdmin(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (ctx.user.role !== "ORG_ADMIN" && ctx.user.role !== "SUPERADMIN") redirect("/portal");
  return ctx;
}

export async function requireSuperadmin(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (ctx.user.role !== "SUPERADMIN") redirect("/");
  return ctx;
}

/**
 * v1 admin console guard. The console manages EVERY tenant's mailboxes with no
 * org scoping yet, so until P2 wires `scopedDomains` for org-scoped ORG_ADMIN
 * access, only the platform SUPERADMIN may reach it. Everyone else goes to the
 * self-service portal. (Prevents cross-tenant account/alias takeover by a future
 * ORG_ADMIN principal.)
 */
export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (ctx.user.role !== "SUPERADMIN") redirect("/portal");
  return ctx;
}

/** Domain names the actor may manage: all for SUPERADMIN, own org's for ORG_ADMIN/USER. */
export async function scopedDomains(ctx: AuthContext): Promise<string[]> {
  if (ctx.user.role === "SUPERADMIN") {
    const all = await prisma.domain.findMany({ select: { name: true } });
    return all.map((d) => d.name);
  }
  if (!ctx.user.orgId) return [];
  const own = await prisma.domain.findMany({
    where: { orgId: ctx.user.orgId },
    select: { name: true },
  });
  return own.map((d) => d.name);
}
