/**
 * Ensure required env vars exist before Prisma/auth initialize.
 * Postgres is the primary store; missing DATABASE_URL → memory catalog mode.
 */
export function ensureEnv(): void {
  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET =
      "freshmint-dev-secret-change-in-production-32b";
  }

  if (!process.env.NEXT_PUBLIC_APP_NAME) {
    process.env.NEXT_PUBLIC_APP_NAME = "FreshMint Marketplace";
  }
}

ensureEnv();

export function getDatabaseUrl(): string | null {
  ensureEnv();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  // Legacy sqlite file URLs are no longer supported after the Postgres cutover.
  if (url.startsWith("file:")) return null;
  return url;
}

export function isPostgresConfigured(): boolean {
  const url = getDatabaseUrl();
  return Boolean(url?.startsWith("postgres"));
}
