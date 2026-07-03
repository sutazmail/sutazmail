/**
 * Append-only audit trail. Called from every mutating server action and from
 * login/logout. Intentionally never throws — an audit failure must not block
 * the operation itself (it is logged for the operator instead).
 */
import { prisma } from "./db";
import type { Prisma } from "../generated/prisma/client";

export async function audit(
  action: string,
  target: string,
  opts: { orgId?: string | null; actorId?: string | null; detail?: unknown } = {},
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        target,
        orgId: opts.orgId ?? null,
        actorId: opts.actorId ?? null,
        detail:
          opts.detail === undefined ? undefined : (opts.detail as Prisma.InputJsonValue),
      },
    });
  } catch (err) {
    console.error(`[audit] write failed for ${action} ${target}:`, err);
  }
}
