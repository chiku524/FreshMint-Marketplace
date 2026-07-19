import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl, ensureEnv } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  ensureEnv();
  const url = getDatabaseUrl();
  if (!url) {
    // Caller paths that hit Prisma should already be gated by ensureDatabaseReady /
    // memory mode. Still construct a client so imports don't crash at module load.
    return new PrismaClient({
      adapter: new PrismaPg({
        connectionString: "postgresql://localhost:5432/unused",
      }),
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }

  const adapter = new PrismaPg({
    connectionString: url,
    // Prisma Postgres / managed hosts often use certs that need this in Node pg.
    ssl:
      url.includes("sslmode=require") || url.includes("prisma.io")
        ? { rejectUnauthorized: false }
        : undefined,
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
