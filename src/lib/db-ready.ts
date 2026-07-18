import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { getDatabaseUrl, getSqliteFilesystemPath, ensureEnv } from "@/lib/env";
import { enableMemoryMode } from "@/lib/data/memory-store";

const globalReady = globalThis as unknown as {
  __freshmintDbReady?: Promise<"sqlite" | "memory">;
};

function runPrisma(args: string[], url: string) {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(npx, args, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}

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
 * Create schema (and seed once) if the SQLite file is missing or empty.
 * Falls back to in-memory mode when the filesystem cannot host SQLite
 * (common on read-only previews / serverless).
 */
export async function ensureDatabaseReady(): Promise<"sqlite" | "memory"> {
  if (!globalReady.__freshmintDbReady) {
    globalReady.__freshmintDbReady = (async () => {
      try {
        ensureEnv();
        const dbPath = getSqliteFilesystemPath();
        const url = getDatabaseUrl();
        const fileMissing = !existsSync(dbPath);

        if (!fileMissing && (await canQuery(url))) {
          console.info("[freshmint] database ready:", path.resolve(dbPath));
          return "sqlite" as const;
        }

        console.info(
          "[freshmint] provisioning sqlite at",
          path.resolve(dbPath),
          fileMissing ? "(new file)" : "(heal)",
        );

        try {
          runPrisma(
            ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"],
            url,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          enableMemoryMode(`db push failed: ${message}`);
          return "memory" as const;
        }

        if (!(await canQuery(url))) {
          enableMemoryMode("sqlite still unreadable after provision");
          return "memory" as const;
        }

        try {
          const { PrismaClient } = await import("@prisma/client");
          const client = new PrismaClient({
            datasources: { db: { url } },
          });
          const count = await client.user.count();
          await client.$disconnect();
          if (count === 0) {
            runPrisma(["tsx", "prisma/seed.ts"], url);
            console.info("[freshmint] database seeded");
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn("[freshmint] seed skipped:", message);
        }

        return "sqlite" as const;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        enableMemoryMode(message);
        return "memory" as const;
      }
    })();
  }

  return globalReady.__freshmintDbReady;
}
