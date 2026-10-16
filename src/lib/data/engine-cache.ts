/**
 * Short-lived, per-process cache for the Prisma-backed discovery engine.
 *
 * Every page / API call used to reload seven whole tables. A 10k-item
 * collection upload (~2 requests per item) therefore did ~140k full-table
 * scans whose cost grew with every inserted listing. Sharing one engine for a
 * few seconds collapses a burst into a handful of loads. Writes made through
 * the engine mutate the shared state in place (same model as memory mode), so
 * the same instance sees its own writes immediately; other instances converge
 * within the TTL. Set ENGINE_CACHE_TTL_MS=0 to disable.
 */
export type EngineCacheOptions = { ttlMs: number; now?: () => number };

export function engineCacheTtlMs(): number {
  const raw = process.env.ENGINE_CACHE_TTL_MS;
  if (raw === undefined || raw === "") return 10_000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 10_000;
}

export function createEngineCache<T>() {
  let value: T | null = null;
  let loadedAt = 0;
  let inflight: Promise<T> | null = null;

  return {
    async get(load: () => Promise<T>, opts: EngineCacheOptions): Promise<T> {
      const now = (opts.now ?? Date.now)();
      if (value !== null && opts.ttlMs > 0 && now - loadedAt < opts.ttlMs) {
        return value;
      }
      if (inflight) return inflight;
      const p = load().then(
        (v) => {
          if (opts.ttlMs > 0) {
            value = v;
            loadedAt = (opts.now ?? Date.now)();
          }
          return v;
        },
        (err) => {
          value = null;
          throw err;
        },
      );
      inflight = p;
      try {
        return await p;
      } finally {
        if (inflight === p) inflight = null;
      }
    },
    invalidate() {
      value = null;
      loadedAt = 0;
    },
  };
}