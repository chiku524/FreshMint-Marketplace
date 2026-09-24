import { describe, expect, it } from "vitest";
import {
  HOME_HOT_WORKS_WEIGHTS,
  isBuyableHomeListing,
  scoreHotWork,
} from "@/lib/marketplace/home-discovery-config";
import {
  collectionsSubtitleMode,
  deriveCollectionFloorUsd,
  fillCollectionDiscovery,
  fillHotWorksDiscovery,
  hotWorksSubtitleMode,
  rankByVolumeDesc,
  rankHotWorks,
  selectEnglishAuctionsEndingSoon,
  selectTimedWindowDropsLive,
} from "@/lib/marketplace/home-discovery";
import type { Listing } from "@/lib/discovery/types";

function baseListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "l1",
    title: "Work",
    description: "",
    creatorId: "c1",
    type: "single",
    chain: "evm",
    network: "ethereum",
    stage: "soft_launch",
    priceUsd: 100,
    medium: "digital",
    styleTags: [],
    mediaHash: "h",
    metadataComplete: true,
    originalMedia: true,
    createdAt: 1,
    softLaunchedAt: 1,
    risingEligibleAt: null,
    featuredAt: null,
    featuredBoostedAt: null,
    oeStartsAt: null,
    oeEndsAt: null,
    auctionStartsAt: null,
    auctionEndsAt: null,
    collectionId: null,
    isCollectionHero: false,
    signals: {
      saves: 0,
      follows: 0,
      dwellMsTotal: 0,
      uniqueViewers: 0,
      impressionsToday: 0,
      impressionsThisWeek: 0,
      pageViews: 0,
      reportRate: 0,
      nominationScore: 0,
    },
    delisted: false,
    appealStatus: "none",
    ...overrides,
  };
}

describe("scoreHotWork", () => {
  it("applies config weights", () => {
    expect(
      scoreHotWork({ views: 10, saves: 2, bids: 1, purchases: 1 }),
    ).toBe(
      10 * HOME_HOT_WORKS_WEIGHTS.view +
        2 * HOME_HOT_WORKS_WEIGHTS.save +
        1 * HOME_HOT_WORKS_WEIGHTS.bid +
        1 * HOME_HOT_WORKS_WEIGHTS.purchase,
    );
  });

  it("ignores negative activity", () => {
    expect(
      scoreHotWork({ views: -5, saves: 1, bids: 0, purchases: 0 }),
    ).toBe(HOME_HOT_WORKS_WEIGHTS.save);
  });
});

describe("isBuyableHomeListing", () => {
  it("excludes drafts and delisted", () => {
    expect(isBuyableHomeListing({ stage: "draft" })).toBe(false);
    expect(isBuyableHomeListing({ stage: "soft_launch", delisted: true })).toBe(
      false,
    );
    expect(isBuyableHomeListing({ stage: "soft_launch" })).toBe(true);
  });
});

describe("fillCollectionDiscovery fallbacks", () => {
  it("ranks 7d volume and requires positive volume (spam guard)", () => {
    const ranked = rankByVolumeDesc([
      { id: "a", volumeUsd: 0 },
      { id: "b", volumeUsd: 50 },
      { id: "c", volumeUsd: 200 },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["c", "b"]);
  });

  it("fills from top volume then new, without inventing 7d volume", () => {
    const filled = fillCollectionDiscovery({
      trending7d: [{ id: "t1", volumeUsd: 80 }],
      topAllTime: [
        { id: "t1", volumeUsd: 500 },
        { id: "v1", volumeUsd: 900 },
        { id: "v2", volumeUsd: 10 },
      ],
      newThisWeekIds: ["n1", "v1"],
      limit: 4,
    });
    expect(filled.map((f) => [f.id, f.source])).toEqual([
      ["t1", "trending_7d"],
      ["v1", "top_volume"],
      ["v2", "top_volume"],
      ["n1", "new_this_week"],
    ]);
    expect(collectionsSubtitleMode(filled.map((f) => f.source))).toBe("mixed");
  });

  it("labels honestly when only all-time filler", () => {
    const filled = fillCollectionDiscovery({
      trending7d: [],
      topAllTime: [{ id: "v1", volumeUsd: 100 }],
      newThisWeekIds: [],
      limit: 3,
    });
    expect(collectionsSubtitleMode(filled.map((f) => f.source))).toBe(
      "top_volume",
    );
  });

  it("labels new when only new-this-week filler", () => {
    const filled = fillCollectionDiscovery({
      trending7d: [],
      topAllTime: [],
      newThisWeekIds: ["n1", "n2"],
      limit: 2,
    });
    expect(collectionsSubtitleMode(filled.map((f) => f.source))).toBe("new");
  });
});

describe("fillHotWorksDiscovery fallbacks", () => {
  it("prefers hot then most viewed then newest", () => {
    const filled = fillHotWorksDiscovery({
      hotIds: ["h1"],
      mostViewedIds: ["h1", "m1", "m2"],
      newestIds: ["n1", "m1"],
      limit: 3,
    });
    expect(filled.map((f) => [f.id, f.source])).toEqual([
      ["h1", "hot"],
      ["m1", "most_viewed"],
      ["m2", "most_viewed"],
    ]);
    expect(hotWorksSubtitleMode(filled.map((f) => f.source))).toBe("mixed");
  });

  it("rankHotWorks drops zero scores", () => {
    expect(
      rankHotWorks(
        [
          {
            listingId: "a",
            score: 0,
            activity: { views: 0, saves: 0, bids: 0, purchases: 0 },
          },
          {
            listingId: "b",
            score: 12,
            activity: { views: 12, saves: 0, bids: 0, purchases: 0 },
          },
        ],
        5,
      ).map((r) => r.listingId),
    ).toEqual(["b"]);
  });
});

describe("live auction selectors", () => {
  const now = 1_700_000_000_000;

  it("selects english ending soon, hides ended", () => {
    const listings = [
      baseListing({
        id: "en-soon",
        type: "auction",
        saleMode: "english",
        auctionStartsAt: now - 1000,
        auctionEndsAt: now + 5000,
        currentHighBidUsd: 40,
      }),
      baseListing({
        id: "en-later",
        type: "auction",
        saleMode: "english",
        auctionStartsAt: now - 1000,
        auctionEndsAt: now + 9000,
      }),
      baseListing({
        id: "en-ended",
        type: "auction",
        saleMode: "english",
        auctionStartsAt: now - 9000,
        auctionEndsAt: now - 1,
      }),
      baseListing({
        id: "timed",
        type: "auction",
        saleMode: "timed_window",
        auctionStartsAt: now - 1000,
        auctionEndsAt: now + 3000,
      }),
    ];
    expect(
      selectEnglishAuctionsEndingSoon(listings, now, 10).map((l) => l.id),
    ).toEqual(["en-soon", "en-later"]);
    expect(
      selectTimedWindowDropsLive(listings, now, 10).map((l) => l.id),
    ).toEqual(["timed"]);
  });
});

describe("deriveCollectionFloorUsd", () => {
  it("takes lowest buyable fixed price and ignores drafts", () => {
    const floor = deriveCollectionFloorUsd([
      baseListing({ id: "a", priceUsd: 120, stage: "soft_launch" }),
      baseListing({ id: "b", priceUsd: 80, stage: "draft" }),
      baseListing({ id: "c", priceUsd: 95, stage: "rising_eligible" }),
    ]);
    expect(floor).toBe(95);
  });
});
