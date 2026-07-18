/**
 * Runs once when the Next.js server starts — before request handlers.
 * Normalizes DATABASE_URL and provisions SQLite schema/seed if needed.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  const { ensureEnv } = await import("@/lib/env");
  ensureEnv();

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  await ensureDatabaseReady();
}
