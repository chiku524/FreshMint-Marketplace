import { describe, expect, it } from "vitest";
import { buildSeedState } from "@/lib/data/seed";
import { rankTrendingListings } from "@/lib/marketplace/trending";
import type { Listing } from "@/lib/discovery/types";

function fromSeed(
  patch: Omit<Partial<Listing>, "signals"> & {
    id: string;
    signals?: Partial<Listing["signals"]>;
  },
): Listing {
  const seed = buildSeedState().listings.get("listing-fresh-1");
  if (!seed) throw new Error("missing seed listing");
  return {
    ...seed,
    ...patch,
    delisted: patch.delisted ?? false,
    stage: patch.stage ?? "soft_launch",
    signals: { ...seed.signals, ...patch.signals },
  };
}

describe("rankTrendingListings", () => {
  it("orders public works by page views, then saves, then unique viewers", () => {
    const ranked = rankTrendingListings([
      fromSeed({
        id: "low",
        createdAt: 3,
        signals: { pageViews: 1, saves: 9, uniqueViewers: 9 },
      }),
      fromSeed({
        id: "newer-tie",
        createdAt: 9,
        signals: { pageViews: 4, saves: 8, uniqueViewers: 1 },
      }),
      fromSeed({
        id: "draft",
        stage: "draft",
        signals: { pageViews: 99, saves: 99, uniqueViewers: 99 },
      }),
      fromSeed({
        id: "saves",
        createdAt: 2,
        signals: { pageViews: 4, saves: 8, uniqueViewers: 1 },
      }),
      fromSeed({
        id: "viewers",
        createdAt: 4,
        signals: { pageViews: 4, saves: 3, uniqueViewers: 20 },
      }),
      fromSeed({
        id: "delisted",
        delisted: true,
        signals: { pageViews: 99, saves: 0, uniqueViewers: 0 },
      }),
      fromSeed({
        id: "views",
        createdAt: 1,
        signals: { pageViews: 10, saves: 0, uniqueViewers: 0 },
      }),
    ]);

    expect(ranked.map((listing) => listing.id)).toEqual([
      "views",
      "newer-tie",
      "saves",
      "viewers",
      "low",
    ]);
  });
});
