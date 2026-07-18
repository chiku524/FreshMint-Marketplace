/**
 * Runs once when the Next.js server starts — before request handlers.
 * Guarantees DATABASE_URL exists even when .env was not injected.
 */
export async function register() {
  // Prisma/SQLite are Node-only; skip Edge instrumentation runtime.
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { ensureEnv } = await import("@/lib/env");
  ensureEnv();
}
