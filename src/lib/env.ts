/**
 * Ensure required env vars exist before Prisma/auth initialize.
 * Preview/deploy sandboxes often omit .env — fall back to local SQLite.
 * Uses a schema-relative SQLite URL (Prisma resolves `file:./dev.db` from prisma/).
 */
export function ensureEnv(): void {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "file:./dev.db";
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
