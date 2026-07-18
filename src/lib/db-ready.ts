import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { getDatabaseUrl, getSqliteFilesystemPath, ensureEnv } from "@/lib/env";

const globalReady = globalThis as unknown as {
  __freshmintDbReady?: Promise<void>;
};

function runPrisma(args: string[], url: string) {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(npx, args, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}

/**
 * Create schema (and seed once) if the SQLite file is missing or empty.
 * Safe to call repeatedly — no-ops when User table already has rows.
 */
export async function ensureDatabaseReady(): Promise<void> {
  if (!globalReady.__freshmintDbReady) {
    globalReady.__freshmintDbReady = (async () => {
      ensureEnv();
      const dbPath = getSqliteFilesystemPath();
      const url = getDatabaseUrl();
      const fileMissing = !existsSync(dbPath);

      let needsSeed = fileMissing;

      if (!fileMissing) {
        try {
          const { PrismaClient } = await import("@prisma/client");
          const client = new PrismaClient({
            datasources: { db: { url } },
          });
          const count = await client.user.count();
          await client.$disconnect();
          if (count === 0) needsSeed = true;
          console.info("[freshmint] database ready:", path.resolve(dbPath));
          if (!needsSeed) return;
        } catch {
          // Schema missing / corrupt — fall through to db push
          needsSeed = true;
        }
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
        console.error("[freshmint] prisma db push failed:", message);
        throw err;
      }

      if (needsSeed) {
        try {
          runPrisma(["tsx", "prisma/seed.ts"], url);
          console.info("[freshmint] database seeded");
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[freshmint] seed failed:", message);
        }
      }
    })();
  }

  return globalReady.__freshmintDbReady;
}
