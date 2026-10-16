import { describe, expect, it, vi } from "vitest";
import { createEngineCache } from "./engine-cache";

describe("createEngineCache", () => {
  it("reuses value within ttl and dedupes concurrent loads", async () => {
    let t = 0;
    const cache = createEngineCache<number>();
    const load = vi.fn(async () => 42);
    const [a, b] = await Promise.all([
      cache.get(load, { ttlMs: 1000, now: () => t }),
      cache.get(load, { ttlMs: 1000, now: () => t }),
    ]);
    expect(a + b).toBe(84);
    t = 500;
    await cache.get(load, { ttlMs: 1000, now: () => t });
    expect(load).toHaveBeenCalledTimes(1);
    t = 1500;
    await cache.get(load, { ttlMs: 1000, now: () => t });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not cache when ttl is 0 and recovers after errors", async () => {
    const cache = createEngineCache<number>();
    const bad = vi.fn(async () => { throw new Error("down"); });
    await expect(cache.get(bad, { ttlMs: 1000 })).rejects.toThrow("down");
    const load = vi.fn(async () => 1);
    await cache.get(load, { ttlMs: 0 });
    await cache.get(load, { ttlMs: 0 });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("invalidate forces reload", async () => {
    const cache = createEngineCache<number>();
    const load = vi.fn(async () => 1);
    await cache.get(load, { ttlMs: 1000 });
    cache.invalidate();
    await cache.get(load, { ttlMs: 1000 });
    expect(load).toHaveBeenCalledTimes(2);
  });
});