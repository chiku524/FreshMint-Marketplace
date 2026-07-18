import type { NextConfig } from "next";
import path from "node:path";

// Bootstrap absolute SQLite URL for build-time Prisma (cwd-safe).
{
  const abs = path.join(process.cwd(), "prisma", "dev.db").replace(/\\/g, "/");
  const current = process.env.DATABASE_URL ?? "";
  if (
    !current ||
    current.startsWith("file:./") ||
    current === "file:./dev.db" ||
    current === "file:dev.db"
  ) {
    process.env.DATABASE_URL = `file:${abs}`;
  }
}
if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = "freshmint-dev-secret-change-in-production-32b";
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [],
    unoptimized: true,
  },
};

export default nextConfig;
