import type { NextConfig } from "next";

// Bootstrap env for build-time Prisma and SSR (before modules load).
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./dev.db";
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
