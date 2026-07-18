import { PrismaClient } from "@prisma/client";
import { getDatabaseUrl, ensureEnv } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  ensureEnv();
  const url = getDatabaseUrl();
  return new PrismaClient({
    ...(url
      ? {
          datasources: {
            db: { url },
          },
        }
      : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
