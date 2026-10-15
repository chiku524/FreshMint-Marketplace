/**
 * Decide whether `npm run build` should run `prisma migrate deploy`.
 *
 * - No DATABASE_URL: skip (app runs in memory catalog mode).
 * - SKIP_DB_MIGRATE=1: skip (explicit escape hatch, any env).
 * - Vercel Preview: skip unless MIGRATE_ON_PREVIEW=1. Preview and Production
 *   share one DATABASE_URL today, so a branch build must not migrate (or
 *   fail on) the production database.
 * - Everything else (Production, local, CI): run and fail the build on error.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ run: boolean; reason: string }}
 */
export function migratePolicy(env) {
  const flag = (v) => ["1", "true", "yes"].includes(String(v ?? "").trim().toLowerCase());
  if (!String(env.DATABASE_URL ?? "").trim()) {
    return { run: false, reason: "DATABASE_URL is not set (memory catalog mode)" };
  }
  if (flag(env.SKIP_DB_MIGRATE)) {
    return { run: false, reason: "SKIP_DB_MIGRATE is set" };
  }
  if (env.VERCEL_ENV === "preview" && !flag(env.MIGRATE_ON_PREVIEW)) {
    return {
      run: false,
      reason: "Vercel Preview build (set MIGRATE_ON_PREVIEW=1 to migrate a preview database)",
    };
  }
  return { run: true, reason: env.VERCEL_ENV ? `Vercel ${env.VERCEL_ENV}` : "local/CI" };
}

/** Prisma errors that retrying cannot fix (bad host/creds/db missing). */
export const NON_RETRYABLE_PRISMA_CODES = ["P1000", "P1001", "P1003", "P1010", "P3009", "P3018"];

/** @param {string} output */
export function nonRetryableCode(output) {
  return NON_RETRYABLE_PRISMA_CODES.find((code) => output.includes(`${code}:`)) ?? null;
}