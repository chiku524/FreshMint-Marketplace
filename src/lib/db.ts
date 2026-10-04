import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl, ensureEnv } from "@/lib/env";
import { createPrismaAdapter } from "@/lib/prisma-adapter";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  ensureEnv();
  const url = getDatabaseUrl();
  if (!url) {
    // Caller paths that hit Prisma should already be gated by ensureDatabaseReady /
    // memory mode. Still construct a client so imports don't crash at module load.
    return new PrismaClient({
      adapter: createPrismaAdapter("postgresql://localhost:5432/unused"),
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }

  return new PrismaClient({
    adapter: createPrismaAdapter(url),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

// Cache across warm serverless invocations (not only in development / HMR).
globalForPrisma.prisma = prisma;
