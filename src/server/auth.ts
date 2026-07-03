/**
 * Single-admin auth primitives (username + password, bcrypt, httpOnly session cookie).
 *
 * - Password: bcryptjs (pure-JS bcrypt — no native build, works in alpine).
 * - Session: a compact `payload.signature` token, HMAC-SHA256 over the payload with
 *   SESSION_SECRET, verified in constant time. Stored in an httpOnly cookie by the
 *   login action. Next 16 `proxy.ts` is only used for optimistic redirects (per its docs
 *   it must NOT be the authorization solution) — real checks happen here.
 *
 * Pure and dependency-light so it is unit-tested without a database.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

export interface SessionPayload {
  /** Admin username. */
  sub: string;
  /** Expiry, epoch ms. */
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

export function signSession(payload: SessionPayload, secret: string): string {
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/** Returns the payload if the token is authentic and unexpired, else null. */
export function verifySession(
  token: string | undefined,
  secret: string,
  now: number = Date.now(),
): SessionPayload | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;

  const payloadB64 = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  const expectedSig = sign(payloadB64, secret);

  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "sutazmail_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
