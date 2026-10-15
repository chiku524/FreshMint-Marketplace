import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimitsForTests, clientIp, limitByIp, rateLimit } from "../rate-limit";

describe("rateLimit", () => {
  beforeEach(() => __resetRateLimitsForTests());

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

describe("limitByIp", () => {
  beforeEach(() => __resetRateLimitsForTests());

  it("uses the first x-forwarded-for hop and returns 429 when exceeded", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" },
    });
    expect(clientIp(req)).toBe("1.2.3.4");
    expect(limitByIp(req, "t", 1, 60_000)).toBeNull();
    const res = limitByIp(req, "t", 1, 60_000);
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBeTruthy();
  });
});
