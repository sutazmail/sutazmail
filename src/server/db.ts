/**
 * PrismaClient singleton (Prisma 7 `prisma-client` generator, src/generated/prisma).
 * Prisma 7 requires an explicit driver adapter — same verified pattern as SutazStays:
 * `new PrismaClient({ adapter: new PrismaPg({...}) })`.
 * Singleton guard: Next.js dev-mode hot reload would otherwise spawn one client
 * (and one pg pool) per reload.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
