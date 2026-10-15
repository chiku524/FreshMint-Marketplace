import { NextResponse } from "next/server";

/**
 * Best-effort fixed-window rate limiter kept in process memory.
 *
 * On serverless this is per-instance, so it slows brute force and abuse
 * rather than guaranteeing a global cap. Swap the store for Redis/KV when a
 * shared limit is needed.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) {
      for (const [k, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(k);
      }
      if (buckets.size >= MAX_KEYS) buckets.clear();
    }
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  const ok = bucket.count <= limit;
  return {
    ok,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSec: ok ? 0 : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Returns a 429 response when `req` exceeds `limit` requests per `windowMs`
 * for the given bucket name, otherwise `null`.
 */
export function limitByIp(
  req: Request,
  name: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  const result = rateLimit(`${name}:${clientIp(req)}`, limit, windowMs);
  if (result.ok) return null;
  return NextResponse.json(
    { error: "rate_limited", retryAfterSec: result.retryAfterSec },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } },
  );
}

export function __resetRateLimitsForTests() {
  buckets.clear();
}
