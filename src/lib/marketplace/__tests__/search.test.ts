import { describe, expect, it } from "vitest";
import {
  listingMatchesOpenExtras,
  normalizeSearchQuery,
  searchCatalog,
} from "@/lib/marketplace/search";
import type { Listing } from "@/lib/discovery/types";

function listing(partial: Partial<Listing> & { id: string; title: string }): Listing {
  return {
    description: "",
    creatorId: "c1",
    type: "single",
    chain: "evm",
    network: "ethereum",
    stage: "soft_launch",
    priceUsd: 10,
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
    ...partial,
  };
}

describe("searchCatalog", () => {
  it("matches works by title", () => {
    const hits = searchCatalog({
      query: "moon",
      listings: [listing({ id: "1", title: "Moon ink" }), listing({ id: "2", title: "Sun" })],
      collections: [],
      creators: [],
    });
    expect(hits.map((h) => (h.kind === "work" ? h.listing.id : ""))).toEqual(["1"]);
  });

  it("ignores empty query", () => {
    expect(normalizeSearchQuery("  ")).toBe("");
    expect(
      searchCatalog({
        query: " ",
        listings: [listing({ id: "1", title: "A" })],
        collections: [],
        creators: [],
      }),
    ).toEqual([]);
  });
});

describe("listingMatchesOpenExtras", () => {
  const now = 1_700_000_000_000;
  it("filters saleMode and ending soon", () => {
    const en = listing({
      id: "e",
      title: "E",
      type: "auction",
      saleMode: "english",
      auctionEndsAt: now + 3_600_000,
    });
    expect(listingMatchesOpenExtras(en, { saleMode: "english", now })).toBe(true);
    expect(listingMatchesOpenExtras(en, { saleMode: "fixed", now })).toBe(false);
    expect(
      listingMatchesOpenExtras(en, { endingSoon: true, now, endingSoonMs: 7200_000 }),
    ).toBe(true);
    expect(
      listingMatchesOpenExtras(en, { endingSoon: true, now, endingSoonMs: 1000 }),
    ).toBe(false);
  });
});
