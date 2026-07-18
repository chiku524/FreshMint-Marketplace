import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function toSqliteFileUrl(absolutePath: string): string {
  return `file:${absolutePath.replace(/\\/g, "/")}`;
}

function canWriteDir(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a writable absolute SQLite path.
 *
 * Preview/serverless hosts often ship a read-only app directory. In that case
 * we copy the bundled prisma/dev.db into os.tmpdir() and open that instead.
 */
export function resolveSqlitePath(): string {
  const bundled = path.join(process.cwd(), "prisma", "dev.db");
  const preferredDir = path.join(process.cwd(), "prisma");

  if (canWriteDir(preferredDir)) {
    return path.join(preferredDir, "dev.db");
  }

  const fallbackDir = path.join(tmpdir(), "freshmint");
  mkdirSync(fallbackDir, { recursive: true });
  const fallbackDb = path.join(fallbackDir, "dev.db");

  if (existsSync(bundled)) {
    try {
      copyFileSync(bundled, fallbackDb);
    } catch {
      // Another instance may have created it; continue if readable.
    }
  }

  return fallbackDb;
}

function isRelativeSqliteUrl(url: string | undefined): boolean {
  if (!url) return true;
  if (!url.startsWith("file:")) return false;
  const filePath = url.slice("file:".length);
  if (filePath.startsWith("./") || filePath.startsWith(".\\")) return true;
  if (filePath === "dev.db" || filePath === "prisma/dev.db") return true;
  if (filePath.startsWith("/") || /^[A-Za-z]:\//.test(filePath)) return false;
  return !path.isAbsolute(filePath);
}

/**
 * Ensure required env vars exist before Prisma/auth initialize.
 * Always rewrites relative SQLite URLs to an absolute writable path.
 */
export function ensureEnv(): void {
  if (isRelativeSqliteUrl(process.env.DATABASE_URL)) {
    process.env.DATABASE_URL = toSqliteFileUrl(resolveSqlitePath());
  }

  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET =
      "freshmint-dev-secret-change-in-production-32b";
  }

  if (!process.env.NEXT_PUBLIC_APP_NAME) {
    process.env.NEXT_PUBLIC_APP_NAME = "FreshMint Marketplace";
  }
}

ensureEnv();

export function getDatabaseUrl(): string {
  ensureEnv();
  return process.env.DATABASE_URL as string;
}

export function getSqliteFilesystemPath(): string {
  ensureEnv();
  return (process.env.DATABASE_URL as string).replace(/^file:/, "");
}
