import { ensureEnv, getDatabaseUrl, isPostgresConfigured } from "@/lib/env";
import { enableMemoryMode } from "@/lib/data/memory-store";

export type DataMode = "prisma" | "memory";

const globalReady = globalThis as unknown as {
  __freshmintDbReady?: Promise<DataMode>;
};

async function canQuery(url: string): Promise<boolean> {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const client = new PrismaClient({
      datasources: { db: { url } },
    });
    await client.$connect();
    await client.user.count();
    await client.$disconnect();
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

        if (await canQuery(url)) {
          console.info("[freshmint] postgres ready");
          return "prisma" as const;
        }

        enableMemoryMode("postgres unreachable");
        return "memory" as const;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        enableMemoryMode(message);
        return "memory" as const;
      }
    })();
  }

  return globalReady.__freshmintDbReady;
}
