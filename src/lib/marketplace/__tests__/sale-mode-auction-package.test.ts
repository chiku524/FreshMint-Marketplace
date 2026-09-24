import { describe, expect, it } from "vitest";
import {
  listingTypeForSaleMode,
  minNextBidUsd,
  parseSaleMode,
  resolveSaleMode,
  saleModeBadge,
} from "@/lib/marketplace/sale-mode";
import {
  englishSettlement,
  evaluateBidRules,
  type AuctionListingSnap,
} from "@/lib/marketplace/english-auction";
import { filterPackageEligibleListings } from "@/lib/marketplace/package-sell";

describe("saleMode mapping", () => {
  it("maps english/timed_window to auction type for discovery", () => {
    expect(listingTypeForSaleMode("english")).toBe("auction");
    expect(listingTypeForSaleMode("timed_window")).toBe("auction");
    expect(listingTypeForSaleMode("fixed", "single")).toBe("single");
    expect(listingTypeForSaleMode("fixed", "open_edition")).toBe(
      "open_edition",
    );
  });

  it("migrates legacy type=auction to timed_window", () => {
    expect(resolveSaleMode({ type: "auction" })).toBe("timed_window");
    expect(resolveSaleMode({ type: "auction", saleMode: "english" })).toBe(
      "english",
    );
    expect(resolveSaleMode({ type: "single" })).toBe("fixed");
    expect(parseSaleMode("nope")).toBe("fixed");
  });

  it("exposes distinct badges", () => {
    expect(saleModeBadge({ type: "auction", saleMode: "english" })).toMatch(
      /English auction/i,
    );
    expect(saleModeBadge({ type: "auction" })).toMatch(/Timed window/i);
  });
});

describe("english bid rules", () => {
  const base: AuctionListingSnap = {
    id: "l1",
    creatorId: "creator",
    type: "auction",
    saleMode: "english",
    delisted: false,
    priceUsd: 10,
    startingBidUsd: 10,
    reserveUsd: 25,
    currentHighBidUsd: null,
    highBidderId: null,
    auctionStartsAt: 1_000,
    auctionEndsAt: 10_000,
  };

  it("rejects bids outside the window and below min increment", () => {
    expect(
      evaluateBidRules({
        listing: base,
        bidderId: "b1",
        amountUsd: 10,
        now: 500,
      }).ok,
    ).toBe(false);

    expect(
      evaluateBidRules({
        listing: base,
        bidderId: "b1",
        amountUsd: 10,
        now: 2_000,
      }),
    ).toEqual({ ok: true, minBid: 10 });

    const withHigh: AuctionListingSnap = {
      ...base,
      currentHighBidUsd: 20,
      highBidderId: "b0",
    };
    const low = evaluateBidRules({
      listing: withHigh,
      bidderId: "b1",
      amountUsd: 20,
      now: 2_000,
    });
    expect(low.ok).toBe(false);
    if (!low.ok) expect(low.error).toBe("bid_too_low");

    const ok = evaluateBidRules({
      listing: withHigh,
      bidderId: "b1",
      amountUsd: minNextBidUsd(withHigh),
      now: 2_000,
    });
    expect(ok.ok).toBe(true);
  });

  it("blocks creator self-bids and non-english modes", () => {
    expect(
      evaluateBidRules({
        listing: base,
        bidderId: "creator",
        amountUsd: 50,
        now: 2_000,
      }).ok,
    ).toBe(false);
    expect(
      evaluateBidRules({
        listing: { ...base, saleMode: "timed_window" },
        bidderId: "b1",
        amountUsd: 50,
        now: 2_000,
      }).ok,
    ).toBe(false);
  });

  it("settles only high bidder after end when reserve met", () => {
    const ended: AuctionListingSnap = {
      ...base,
      currentHighBidUsd: 30,
      highBidderId: "winner",
      auctionEndsAt: 5_000,
    };
    expect(
      englishSettlement({ listing: ended, buyerId: "winner", now: 6_000 }),
    ).toEqual({ ok: true, amountUsd: 30 });
    expect(
      englishSettlement({ listing: ended, buyerId: "other", now: 6_000 }).ok,
    ).toBe(false);
    expect(
      englishSettlement({
        listing: { ...ended, currentHighBidUsd: 20 },
        buyerId: "winner",
        now: 6_000,
      }).ok,
    ).toBe(false);
  });
});

describe("package eligibility", () => {
  it("requires >=2 minted unsold same-network works", () => {
    const listings = [
      {
        id: "a",
        title: "A",
        priceUsd: 10,
        network: "base",
        chain: "evm" as const,
        collectionId: "c1",
        delisted: false,
        contractAddress: "0x1",
        tokenId: "1",
        mintTxHash: "0xm1",
      },
      {
        id: "b",
        title: "B",
        priceUsd: 15,
        network: "base",
        chain: "evm" as const,
        collectionId: "c1",
        delisted: false,
        contractAddress: "0x1",
        tokenId: "2",
        mintTxHash: "0xm2",
      },
      {
        id: "sold",
        title: "S",
        priceUsd: 12,
        network: "base",
        chain: "evm" as const,
        collectionId: "c1",
        delisted: false,
        contractAddress: "0x1",
        tokenId: "3",
        mintTxHash: "0xm3",
      },
    ];
    const ok = filterPackageEligibleListings({
      listings: listings as any,
      collectionId: "c1",
      soldIds: new Set(["sold"]),
    });
    expect(ok.ok).toBe(true);
    expect(ok.listings.map((l) => l.id).sort()).toEqual(["a", "b"]);
    expect(ok.defaultPriceUsd).toBe(25);

    const one = filterPackageEligibleListings({
      listings: listings.slice(0, 1) as any,
      collectionId: "c1",
      soldIds: new Set(),
    });
    expect(one.ok).toBe(false);
  });
});
