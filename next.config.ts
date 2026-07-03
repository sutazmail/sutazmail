import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // v2 ships the full app image (`next start`) so the Prisma CLI is available at
  // runtime for `migrate deploy` — same pattern as SutazStays. No standalone output.
};

export default nextConfig;
