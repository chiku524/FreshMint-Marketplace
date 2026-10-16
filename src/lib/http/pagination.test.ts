import { describe, expect, it } from "vitest";
import { nextCursor, parsePage } from "./pagination";

describe("pagination", () => {
  it("bounds limit and offset", () => {
    const q = (s: string) => parsePage(new URLSearchParams(s), { defaultLimit: 50, maxLimit: 200 });
    expect(q("")).toEqual({ limit: 50, offset: 0 });
    expect(q("limit=9999&cursor=400")).toEqual({ limit: 200, offset: 400 });
    expect(q("limit=abc&cursor=-5")).toEqual({ limit: 50, offset: 0 });
  });
  it("computes next cursor", () => {
    expect(nextCursor(0, 200, 10_000)).toBe("200");
    expect(nextCursor(9_800, 200, 10_000)).toBeNull();
  });
});