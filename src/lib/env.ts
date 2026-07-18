import { accessSync, constants, mkdirSync } from "node:fs";
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
 * Relative `file:./dev.db` breaks under Next.js because PrismaClient
 * datasource overrides resolve against process.cwd(), not prisma/.
 */
export function resolveSqlitePath(): string {
  const preferred = path.join(process.cwd(), "prisma");
  if (canWriteDir(preferred)) {
    return path.join(preferred, "dev.db");
  }
  const fallbackDir = path.join(tmpdir(), "freshmint");
  mkdirSync(fallbackDir, { recursive: true });
  return path.join(fallbackDir, "dev.db");
}

function isRelativeSqliteUrl(url: string | undefined): boolean {
  if (!url) return true;
  if (!url.startsWith("file:")) return false;
  const filePath = url.slice("file:".length);
  if (filePath.startsWith("./") || filePath.startsWith(".\\")) return true;
  if (filePath === "dev.db" || filePath === "prisma/dev.db") return true;
  // file:/absolute or file:C:/absolute are fine
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
