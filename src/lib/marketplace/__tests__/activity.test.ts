import { beforeEach, describe, expect, it } from "vitest";
import {
  enableMemoryMode,
  resetMemoryStoreForTests,
} from "@/lib/data/memory-store";
import { listListingActivity } from "@/lib/marketplace/activity";

describe("listListingActivity", () => {
  beforeEach(async () => {
    const { __resetMemoryOffersForTests } = await import(
      "@/lib/marketplace/offers"
    );
    const { __resetMemoryBidsForTests } = await import(
      "@/lib/marketplace/english-auction"
    );
    resetMemoryStoreForTests();
    enableMemoryMode("unit-test");
    __resetMemoryOffersForTests();
    __resetMemoryBidsForTests();
  });

  it("emits mint, list, offer, sale, and transfer from marketplace rows", async () => {
    const { getMemoryEngine, recordMemoryPurchase } = await import(
      "@/lib/data/memory-store"
    );
    const { makeOffer } = await import("@/lib/marketplace/offers");
    const engine = getMemoryEngine();

    const creatorId = "creator-act-1";
    const buyerId = "buyer-act-1";
    const profile = {
      wallets: [] as { chain: "evm"; address: string }[],
      firstListingAt: null as number | null,
      lifetimePrimaryVolumeUsd: 0,
      completedSales: 0,
      flagged: false,
      washCluster: false,
      verifiedCreator: false,
      risingEntriesThisWeek: 0,
      openLaneListingsToday: 0,
      curatorScore: 20,
      establishedBadge: false,
      walletCreatedAt: Date.now(),
    };
    engine.state.creators.set(creatorId, {
      ...profile,
      id: creatorId,
      displayName: "Ada",
      firstListingAt: Date.now(),
    });
    engine.state.creators.set(buyerId, {
      ...profile,
      id: buyerId,
      displayName: "Bob",
    });

    const listingId = "listing-act-1";
    const now = Date.now();
    engine.state.listings.set(listingId, {
      id: listingId,
      title: "Night Mint",
      description: "",
      creatorId,
      type: "single",
      chain: "evm",
      network: "base",
      stage: "soft_launch",
      priceUsd: 40,
      medium: "digital",
      styleTags: [],
      mediaHash: "hash-act-1",
      metadataComplete: true,
      originalMedia: true,
      createdAt: now - 60_000,
      softLaunchedAt: now - 30_000,
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
      mintTxHash: "0xmintact",
      contractAddress: "0xcontractact",
      tokenId: "7",
    });

    const offered = await makeOffer({
      listingId,
      offererId: buyerId,
      amountUsd: 35,
    });
    expect(offered.ok).toBe(true);

    recordMemoryPurchase({
      id: "purchase-act-1",
      listingId,
      buyerId,
      amountUsd: 40,
      chain: "evm",
      status: "completed",
      soldAt: now - 5_000,
      txHash: "0xtransferact",
      paymentTxHash: "0xpayact",
    });

    const events = await listListingActivity(listingId);
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain("mint");
    expect(kinds).toContain("list");
    expect(kinds).toContain("offer");
    expect(kinds).toContain("sale");
    expect(kinds).toContain("transfer");

    const mint = events.find((e) => e.kind === "mint");
    expect(mint?.txHash).toBe("0xmintact");
    expect(mint?.detail).toMatch(/Token 7/);

    const sale = events.find((e) => e.kind === "sale");
    expect(sale?.actorName).toBe("Bob");
    expect(sale?.amountUsd).toBe(40);

    // Newest first.
    expect(events[0]!.at).toBeGreaterThanOrEqual(events[1]!.at);
  });
});
