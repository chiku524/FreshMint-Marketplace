import { describe, expect, it } from "vitest";
import {
  auctionsHref,
  auctionsSaleModeFromSearchParams,
  filterListingsByAuctionsSaleMode,
  listingMatchesAuctionsFilter,
  parseAuctionsSaleMode,
} from "@/lib/marketplace/auctions-filter";
import type { Listing } from "@/lib/discovery/types";

function listing(
  overrides: Partial<Listing> & Pick<Listing, "id" | "type" | "saleMode">,
): Listing {
  return {
    title: "x",
    description: "",
    creatorId: "c",
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
    auctionStartsAt: 1,
    auctionEndsAt: 2,
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

describe("parseAuctionsSaleMode", () => {
  it("defaults unknown / missing to all", () => {
    expect(parseAuctionsSaleMode(undefined)).toBe("all");
    expect(parseAuctionsSaleMode("fixed")).toBe("all");
    expect(parseAuctionsSaleMode("")).toBe("all");
  });

  it("accepts english and timed_window", () => {
    expect(parseAuctionsSaleMode("english")).toBe("english");
    expect(parseAuctionsSaleMode("timed_window")).toBe("timed_window");
    expect(parseAuctionsSaleMode("all")).toBe("all");
  });

  it("maps timed aliases", () => {
    expect(parseAuctionsSaleMode("timed")).toBe("timed_window");
  });

  it("reads from searchParams object and URLSearchParams", () => {
    expect(
      auctionsSaleModeFromSearchParams({ saleMode: "english" }),
    ).toBe("english");
    expect(
      auctionsSaleModeFromSearchParams({ saleMode: ["timed_window"] }),
    ).toBe("timed_window");
    expect(
      auctionsSaleModeFromSearchParams(new URLSearchParams("saleMode=english")),
    ).toBe("english");
  });
});

describe("listingMatchesAuctionsFilter", () => {
  it("maps legacy type=auction with no saleMode to timed_window", () => {
    const legacy = listing({ id: "a", type: "auction", saleMode: undefined });
    expect(listingMatchesAuctionsFilter(legacy, "timed_window")).toBe(true);
    expect(listingMatchesAuctionsFilter(legacy, "english")).toBe(false);
  });

  it("filters english vs timed", () => {
    const en = listing({ id: "e", type: "auction", saleMode: "english" });
    const tw = listing({ id: "t", type: "auction", saleMode: "timed_window" });
    expect(
      filterListingsByAuctionsSaleMode([en, tw], "english").map((l) => l.id),
    ).toEqual(["e"]);
    expect(
      filterListingsByAuctionsSaleMode([en, tw], "all").map((l) => l.id),
    ).toEqual(["e", "t"]);
  });
});

describe("auctionsHref", () => {
  it("omits query for all; shares saleMode otherwise", () => {
    expect(auctionsHref("all")).toBe("/auctions");
    expect(auctionsHref("english")).toBe("/auctions?saleMode=english");
    expect(auctionsHref("timed_window")).toBe(
      "/auctions?saleMode=timed_window",
    );
  });
});
