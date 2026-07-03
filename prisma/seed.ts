/**
 * Idempotent seed — safe to run on every container start.
 * When SEED_SUTAZ_TENANTS=1 (our NAS deployment only), creates the 3 tenant orgs +
 * their domains + the known live mailboxes (role USER, matching `setup email list`
 * on the mailserver as of 2026-07-03). Always ensures the platform superadmin from
 * SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD_HASH env.
 * Existing User rows are never modified here (console/portal own those edits),
 * except the superadmin, whose hash is kept in sync with env.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const ORGS = [
  {
    slug: "tottynotti",
    name: "Tottynotti",
    domains: ["tottynotti.com"],
    mailboxes: [
      "admin@tottynotti.com",
      "gm@tottynotti.com",
      "info@tottynotti.com",
      "sourcing@tottynotti.com",
    ],
  },
  {
    slug: "sutaz-automation",
    name: "Sutaz Automation",
    domains: ["sutaz.ca"],
    mailboxes: ["hello@sutaz.ca", "info@sutaz.ca", "noreply@sutaz.ca"],
  },
  {
    slug: "sutazstays",
    name: "SutazStays",
    domains: ["sutazstays.com"],
    mailboxes: ["info@sutazstays.com", "noreply@sutazstays.com"],
  },
];

async function main() {
  // Sutaz-specific tenant bootstrap — only on our NAS deployment (SEED_SUTAZ_TENANTS=1).
  // Fresh installs from the deploy template start empty and add domains via the UI.
  const orgs = process.env.SEED_SUTAZ_TENANTS === "1" ? ORGS : [];
  for (const o of orgs) {
    const org = await prisma.org.upsert({
      where: { slug: o.slug },
      update: { name: o.name },
      create: { slug: o.slug, name: o.name },
    });
    for (const d of o.domains) {
      await prisma.domain.upsert({
        where: { name: d },
        update: { orgId: org.id },
        create: { name: d, orgId: org.id },
      });
    }
    for (const m of o.mailboxes) {
      await prisma.user.upsert({
        where: { email: m },
        update: {},
        create: { email: m, role: "USER", orgId: org.id },
      });
    }
  }

  const saEmail = (process.env.SUPERADMIN_EMAIL ?? "").trim().toLowerCase();
  const saHash = process.env.SUPERADMIN_PASSWORD_HASH;
  if (saEmail && saHash) {
    await prisma.user.upsert({
      where: { email: saEmail },
      update: { role: "SUPERADMIN", passwordHash: saHash, disabledAt: null },
      create: {
        email: saEmail,
        role: "SUPERADMIN",
        passwordHash: saHash,
        displayName: "Platform admin",
      },
    });
    console.log(`seed: superadmin ${saEmail} ensured`);
  } else {
    console.warn("seed: SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD_HASH not set — superadmin skipped");
  }
  console.log("seed: done");
}

main()
  .catch((e) => {
    console.error("seed failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
