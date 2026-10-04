import { describe, expect, it, vi } from "vitest";
import {
  isRetryableError,
  mapPool,
  mapPoolSettled,
  retryWithBackoff,
} from "@/lib/async/pool";

describe("mapPool", () => {
  it("preserves order with limited concurrency", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapPool([1, 2, 3, 4, 5], 2, async (n) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 15));
      active -= 1;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("settles failures without aborting siblings", async () => {
    const settled = await mapPoolSettled([1, 2, 3], 3, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    });
    expect(settled[0]).toMatchObject({ ok: true, value: 1 });
    expect(settled[1]).toMatchObject({ ok: false });
    expect(settled[2]).toMatchObject({ ok: true, value: 3 });
  });
});

describe("retryWithBackoff", () => {
  it("retries retryable failures then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("503"), { status: 503 }))
      .mockResolvedValueOnce("ok");
    await expect(
      retryWithBackoff(fn, { retries: 2, baseDelayMs: 1, maxDelayMs: 2 }),
    ).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable 4xx", async () => {
    const err = Object.assign(new Error("quota"), {
      status: 400,
      retryable: false,
    });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(
      retryWithBackoff(fn, { retries: 3, baseDelayMs: 1 }),
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("classifies status codes", () => {
    expect(isRetryableError({ status: 429 })).toBe(true);
    expect(isRetryableError({ status: 500 })).toBe(true);
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError({ retryable: false })).toBe(false);
  });
});
