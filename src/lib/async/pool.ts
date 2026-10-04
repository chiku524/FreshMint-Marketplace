/** Run async work over items with a fixed concurrency ceiling. */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const limit = Math.max(1, Math.min(concurrency, Math.max(items.length, 1)));

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

export type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return false to skip further retries (e.g. validation 4xx). */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  signal?: AbortSignal;
};

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason ?? new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return true;
  const e = error as { retryable?: boolean; status?: number; name?: string };
  if (typeof e.retryable === "boolean") return e.retryable;
  if (typeof e.status === "number") {
    if (e.status === 429) return true;
    if (e.status >= 500) return true;
    if (e.status >= 400) return false;
  }
  // Network / abort-adjacent failures are worth another try.
  if (e.name === "TypeError" || e.name === "AbortError") return true;
  return true;
}

/** Exponential backoff with jitter. */
export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 280;
  const maxDelay = opts.maxDelayMs ?? 4_000;
  const shouldRetry = opts.shouldRetry ?? ((err) => isRetryableError(err));

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const isLast = attempt >= retries;
      if (isLast || !shouldRetry(error, attempt)) throw error;
      const expo = Math.min(maxDelay, base * 2 ** attempt);
      const jitter = Math.floor(Math.random() * Math.min(120, expo * 0.25));
      await delay(expo + jitter, opts.signal);
    }
  }
  throw lastError;
}

export type SettledOk<T> = { ok: true; value: T; index: number };
export type SettledErr = { ok: false; error: Error; index: number };

/** mapPool that never rejects — each item settles to ok/error. */
export async function mapPoolSettled<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Array<SettledOk<R> | SettledErr>> {
  return mapPool(items, concurrency, async (item, index) => {
    try {
      const value = await fn(item, index);
      return { ok: true as const, value, index };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error : new Error(String(error)),
        index,
      };
    }
  });
}
