import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getDatabaseUrl, getSqliteFilesystemPath, ensureEnv } from "@/lib/env";
import { enableMemoryMode } from "@/lib/data/memory-store";

const globalReady = globalThis as unknown as {
  __freshmintDbReady?: Promise<"sqlite" | "memory">;
};

async function canQuery(url: string): Promise<boolean> {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const client = new PrismaClient({
      datasources: { db: { url } },
    });
    await client.user.count();
    await client.$disconnect();
    return true;
  } catch {
    return false;
  }
}

/**
 * Open the bundled SQLite DB (copy into place if needed).
 * Never shells out to `npx prisma` — that breaks serverless sandboxes.
 */
export async function ensureDatabaseReady(): Promise<"sqlite" | "memory"> {
  if (!globalReady.__freshmintDbReady) {
    globalReady.__freshmintDbReady = (async () => {
      try {
        ensureEnv();
        const dbPath = getSqliteFilesystemPath();
        const url = getDatabaseUrl();
        const bundled = path.join(process.cwd(), "prisma", "dev.db");

        // If the target file is missing but we shipped a seeded DB, copy it.
        // (Common on read-only hosts that resolve to /tmp/freshmint/dev.db.)
        if (!existsSync(dbPath) && existsSync(bundled)) {
          try {
            mkdirSync(path.dirname(dbPath), { recursive: true });
            copyFileSync(bundled, dbPath);
            console.info(
              "[freshmint] copied bundled sqlite →",
              path.resolve(dbPath),
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn("[freshmint] bundled sqlite copy failed:", message);
          }
        }

        if (await canQuery(url)) {
          console.info("[freshmint] database ready:", path.resolve(dbPath));
          return "sqlite" as const;
        }

        enableMemoryMode("sqlite unreadable after copy attempt");
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
