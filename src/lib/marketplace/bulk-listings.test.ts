import { describe, expect, it } from "vitest";
import { planBulkInsert } from "./bulk-listings";

const item = (h: string) => ({ title: h, mediaHash: h });

describe("planBulkInsert", () => {
  it("dedupes, reuses existing, blocks foreign media", () => {
    const plan = planBulkInsert({
      items: [item("a"), item("a"), item("b"), item("c")],
      existingInCollection: new Map([["b", "L-b"]]),
      foreignHashes: new Map([["c", "L-x"]]),
      currentCount: 0,
    });
    expect(plan.toCreate.map((i) => i.mediaHash)).toEqual(["a"]);
    expect(plan.results.get("b")).toMatchObject({ status: "existing", listingId: "L-b" });
    expect(plan.results.get("c")).toMatchObject({ status: "error" });
    expect(plan.overCap).toBe(false);
  });

  it("allows exactly 10,000 items and rejects the 10,001st", () => {
    expect(
      planBulkInsert({ items: [item("z")], existingInCollection: new Map(), foreignHashes: new Map(), currentCount: 9_999 }).overCap,
    ).toBe(false);
    expect(
      planBulkInsert({ items: [item("z")], existingInCollection: new Map(), foreignHashes: new Map(), currentCount: 10_000 }).overCap,
    ).toBe(true);
  });

  it("retrying an already-created chunk creates nothing", () => {
    const plan = planBulkInsert({
      items: [item("a"), item("b")],
      existingInCollection: new Map([["a", "1"], ["b", "2"]]),
      foreignHashes: new Map(),
      currentCount: 10_000,
    });
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.overCap).toBe(false);
  });
});