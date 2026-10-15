import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";

/**
 * Prisma Postgres free/starter plans reserve most direct TCP slots for platform
 * ops (`prisma_migration` role). App traffic over `@prisma/adapter-pg` exhausts
 * those slots on Vercel. Prefer the serverless HTTP driver for prisma.io hosts.
 */
export function isPrismaPostgresUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === "db.prisma.io" ||
      host === "pooled.db.prisma.io" ||
      host.endsWith(".db.prisma.io") ||
      host.includes("prisma.io")
    );
  } catch {
    return url.includes("prisma.io");
  }
}

/** Prefer PgBouncer hostname when still using TCP against Prisma Postgres. */
export function preferPooledPrismaUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "db.prisma.io") {
      parsed.hostname = "pooled.db.prisma.io";
      return parsed.toString();
    }
  } catch {
    // keep original
  }
  return url;
}

export function createPrismaAdapter(connectionString: string) {
  if (isPrismaPostgresUrl(connectionString)) {
    // PPG uses the direct hostname as a credential/routing hint; transport is HTTP.
    return new PrismaPostgresAdapter({ connectionString });
  }

  const url = preferPooledPrismaUrl(connectionString);
  return new PrismaPg({
    connectionString: url,
    // One connection per serverless isolate — default pool (10) blows small plans.
    max: 1,
    ssl:
      url.includes("sslmode=require") || url.includes("prisma.io")
        ? { rejectUnauthorized: false }
        : undefined,
  });
}
