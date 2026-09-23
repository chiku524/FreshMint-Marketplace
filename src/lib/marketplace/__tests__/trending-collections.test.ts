import { describe, expect, it } from "vitest";
import { buildSeedState } from "@/lib/data/seed";
import { trendingCollectionsFromRanked } from "@/lib/marketplace/trending-collections";
import type { Listing } from "@/lib/discovery/types";

describe("trendingCollectionsFromRanked", () => {
  it("groups ranked listings by collection in attention order", () => {
    const state = buildSeedState();
    const col = [...state.collections.values()][0];
    if (!col) throw new Error("need a seed collection");
    const seed = state.listings.get("listing-fresh-1");
    if (!seed) throw new Error("missing seed");

    const ranked: Listing[] = [
      {
        ...seed,
        id: "t1",
        collectionId: col.id,
        signals: { ...seed.signals, pageViews: 10 },
      },
      {
        ...seed,
        id: "t2",
        collectionId: null,
        signals: { ...seed.signals, pageViews: 9 },
      },
      {
        ...seed,
        id: "t3",
        collectionId: col.id,
        signals: { ...seed.signals, pageViews: 3 },
      },
    ];

    const strip = trendingCollectionsFromRanked(ranked, state.collections, 8);
    expect(strip).toHaveLength(1);
    expect(strip[0]?.collection.id).toBe(col.id);
    expect(strip[0]?.listingCount).toBe(2);
    expect(strip[0]?.topPageViews).toBe(10);
  });
});
