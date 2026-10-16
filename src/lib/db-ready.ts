import { ensureEnv, getDatabaseUrl, isPostgresConfigured } from "@/lib/env";
import {
  clearDatabaseOutage,
  databaseOutageSince,
  enableMemoryMode,
  markDatabaseOutage,
} from "@/lib/data/memory-store";

/** How long to serve the fallback before re-probing an unreachable DB. */
export const DB_RETRY_COOLDOWN_MS = 30_000;

/** True while Postgres is configured but currently unreachable. */
export function isDatabaseDegraded(): boolean {
  return databaseOutageSince() != null;
}

export type DataMode = "prisma" | "memory";

const globalReady = globalThis as unknown as {
  __freshmintDbReady?: Promise<DataMode>;
};

async function canQuery(): Promise<boolean> {
  try {
    // Reuse the process-wide singleton — do not open a second throwaway pool.
    const { prisma } = await import("@/lib/db");
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Connect to Postgres when DATABASE_URL is set.
 * Never shells out to prisma CLI. Falls back to in-memory catalog otherwise.
 */
export async function ensureDatabaseReady(): Promise<DataMode> {
  const outageAt = databaseOutageSince();
  if (outageAt != null && Date.now() - outageAt >= DB_RETRY_COOLDOWN_MS) {
    // Cooldown elapsed: drop the cached verdict and probe again.
    globalReady.__freshmintDbReady = undefined;
  }
  if (!globalReady.__freshmintDbReady) {
    globalReady.__freshmintDbReady = (async () => {
      try {
        ensureEnv();

        if (!isPostgresConfigured()) {
          enableMemoryMode("DATABASE_URL not set to Postgres");
          return "memory" as const;
        }

        const url = getDatabaseUrl();
        if (!url) {
          enableMemoryMode("DATABASE_URL missing");
          return "memory" as const;
        }

        if (await canQuery()) {
          console.info("[freshmint] postgres ready");
          clearDatabaseOutage();
          return "prisma" as const;
        }

        // Restart the cooldown window from this failed probe.
        clearOutageClock();
        markDatabaseOutage("postgres unreachable");
        return "memory" as const;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isPostgresConfigured()) {
          clearOutageClock();
          markDatabaseOutage(message);
        } else {
          enableMemoryMode(message);
        }
        return "memory" as const;
      }
    })();
  }

  return globalReady.__freshmintDbReady;
}

function clearOutageClock() {
  (globalThis as unknown as { __freshmintOutageAt?: number | null }).__freshmintOutageAt = null;
}
