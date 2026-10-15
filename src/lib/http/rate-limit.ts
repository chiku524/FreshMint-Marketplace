import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

/**
 * Rate limiting for API routes.
 *
 * - When Upstash Redis is configured (UPSTASH_REDIS_REST_URL/TOKEN, or the
 *   KV_REST_API_URL/TOKEN pair Vercel Marketplace injects) limits are shared
 *   across all serverless instances.
 * - Otherwise a per-process fixed-window limiter is used (fine for local dev;
 *   best-effort only on serverless).
 * - If Redis errors, requests fail open to the in-memory limiter so an
 *   outage never locks users out.
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

export function upstashCredentials(
  env: Record<string, string | undefined> = process.env,
): { url: string; token: string } | null {
  const url = (env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL)?.trim();
  const token = (env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN)?.trim();
  return url && token ? { url, token } : null;
}

let redis: Redis | null | undefined;
const limiters = new Map<string, Ratelimit>();

function upstashLimiter(name: string, limit: number, windowMs: number): Ratelimit | null {
  if (redis === undefined) {
    const creds = upstashCredentials();
    redis = creds ? new Redis(creds) : null;
  }
  if (!redis) return null;
  const id = `${name}:${limit}:${windowMs}`;
  let limiter = limiters.get(id);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      prefix: `fm:rl:${name}`,
      analytics: false,
    });
    limiters.set(id, limiter);
  }
  return limiter;
}

export async function checkRateLimit(
  name: string,
  identifier: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const limiter = upstashLimiter(name, limit, windowMs);
  if (limiter) {
    try {
      const r = await limiter.limit(identifier);
      return {
        ok: r.success,
        remaining: r.remaining,
        retryAfterSec: r.success ? 0 : Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)),
      };
    } catch (e) {
      console.warn("[rate-limit] Upstash unavailable, using in-memory limiter", e);
    }
  }
  return rateLimit(`${name}:${identifier}`, limit, windowMs);
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function tooMany(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: "rate_limited", retryAfterSec: result.retryAfterSec },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } },
  );
}

/** 429 response when the caller's IP exceeds the limit for `name`, else null. */
export async function limitByIp(
  req: Request,
  name: string,
  limit: number,
  windowMs: number,
): Promise<NextResponse | null> {
  const result = await checkRateLimit(name, clientIp(req), limit, windowMs);
  return result.ok ? null : tooMany(result);
}

/** Same as limitByIp but keyed by signed-in user id when available. */
export async function limitByUserOrIp(
  req: Request,
  userId: string | null | undefined,
  name: string,
  limit: number,
  windowMs: number,
): Promise<NextResponse | null> {
  const id = userId ? `u:${userId}` : `ip:${clientIp(req)}`;
  const result = await checkRateLimit(name, id, limit, windowMs);
  return result.ok ? null : tooMany(result);
}

export function __resetRateLimitsForTests() {
  buckets.clear();
  limiters.clear();
  redis = undefined;
}
