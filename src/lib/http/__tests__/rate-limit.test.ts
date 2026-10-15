import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetRateLimitsForTests,
  clientIp,
  limitByIp,
  limitByUserOrIp,
  rateLimit,
  upstashCredentials,
} from "../rate-limit";

const KEYS = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  __resetRateLimitsForTests();
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("rateLimit (memory)", () => {
  it("allows up to the limit then blocks until the window resets", () => {
    expect(rateLimit("k", 2, 1000, 0).ok).toBe(true);
    expect(rateLimit("k", 2, 1000, 10).ok).toBe(true);
    const blocked = rateLimit("k", 2, 1000, 20);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(1);
    expect(rateLimit("k", 2, 1000, 1001).ok).toBe(true);
  });

  it("keys are independent", () => {
    expect(rateLimit("a", 1, 1000, 0).ok).toBe(true);
    expect(rateLimit("b", 1, 1000, 0).ok).toBe(true);
  });
});

describe("upstashCredentials", () => {
  it("prefers UPSTASH_* and falls back to Vercel KV_* names", () => {
    expect(upstashCredentials({})).toBeNull();
    expect(upstashCredentials({ KV_REST_API_URL: "https://kv", KV_REST_API_TOKEN: "t" })).toEqual({
      url: "https://kv",
      token: "t",
    });
    expect(
      upstashCredentials({
        UPSTASH_REDIS_REST_URL: "https://up",
        UPSTASH_REDIS_REST_TOKEN: "u",
        KV_REST_API_URL: "https://kv",
        KV_REST_API_TOKEN: "t",
      }),
    ).toEqual({ url: "https://up", token: "u" });
    expect(upstashCredentials({ UPSTASH_REDIS_REST_URL: "https://up" })).toBeNull();
  });
});

describe("limitByIp / limitByUserOrIp (no Redis configured)", () => {
  it("uses the first x-forwarded-for hop and returns 429 when exceeded", async () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" },
    });
    expect(clientIp(req)).toBe("1.2.3.4");
    expect(await limitByIp(req, "t", 1, 60_000)).toBeNull();
    const res = await limitByIp(req, "t", 1, 60_000);
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBeTruthy();
  });

  it("keys signed-in callers by user id", async () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "9.9.9.9" } });
    expect(await limitByUserOrIp(req, "u1", "b", 1, 60_000)).toBeNull();
    expect(await limitByUserOrIp(req, "u2", "b", 1, 60_000)).toBeNull();
    expect((await limitByUserOrIp(req, "u1", "b", 1, 60_000))?.status).toBe(429);
  });
});
