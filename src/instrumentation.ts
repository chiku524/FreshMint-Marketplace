/**
 * Runs once when the Next.js server starts — before request handlers.
 * Must never throw: serverless hosts crash the whole process on instrumentation errors.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  try {
    const { ensureEnv } = await import("@/lib/env");
    ensureEnv();

    const { ensureDatabaseReady } = await import("@/lib/db-ready");
    await ensureDatabaseReady();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[freshmint] instrumentation init skipped:", message);
    try {
      const { enableMemoryMode } = await import("@/lib/data/memory-store");
      enableMemoryMode(message);
    } catch {
      // ignore
    }
  }
}
