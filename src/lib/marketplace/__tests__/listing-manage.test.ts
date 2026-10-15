import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canManageListing,
  listingHasPublicSurface,
  listingIsOnChainMinted,
  listingSellerId,
  listingVisibleOnCollectionPage,
} from "@/lib/marketplace/listing-manage";

describe("listing-manage helpers", () => {
  it("resolves seller as sellerId or creator", () => {
    expect(listingSellerId({ creatorId: "c1", sellerId: "s1" })).toBe("s1");
    expect(listingSellerId({ creatorId: "c1", sellerId: null })).toBe("c1");
  });

  it("lets creator or seller manage", () => {
    const listing = { creatorId: "c1", sellerId: "s1" };
    expect(canManageListing("c1", listing)).toBe(true);
    expect(canManageListing("s1", listing)).toBe(true);
    expect(canManageListing("other", listing)).toBe(false);
    expect(canManageListing(null, listing)).toBe(false);
  });

  it("detects public surface via media or mint", () => {
    expect(
      listingHasPublicSurface({
        mediaUrl: "/x.png",
        tokenId: null,
        contractAddress: null,
        mintTxHash: null,
      }),
    ).toBe(true);
    expect(
      listingHasPublicSurface({
        mediaUrl: null,
        tokenId: "1",
        contractAddress: "0xabc",
        mintTxHash: "0xmint",
      }),
    ).toBe(true);
    expect(
      listingHasPublicSurface({
        mediaUrl: null,
        tokenId: "1",
        contractAddress: null,
        mintTxHash: null,
      }),
    ).toBe(false);
  });

  it("shows only on-chain minted works on the collection gallery", () => {
    const unmintedDraft = {
      stage: "draft",
      delisted: false,
      mediaUrl: "/a.png",
      tokenId: null,
      contractAddress: null,
      mintTxHash: null,
    };
    const softUnminted = {
      stage: "soft_launch",
      delisted: false,
      mediaUrl: "/b.png",
      tokenId: null,
      contractAddress: null,
      mintTxHash: null,
    };
    const onChain = {
      stage: "soft_launch",
      delisted: false,
      mediaUrl: "/c.png",
      tokenId: "1",
      contractAddress: "0xabc",
      mintTxHash: "0x" + "ab".repeat(32),
    };
    const simulated = {
      stage: "soft_launch",
      delisted: false,
      mediaUrl: "/d.png",
      tokenId: "1",
      contractAddress: "0xabc",
      mintTxHash: "simulated-mint:col:0",
    };
    const cancelledOnChain = {
      stage: "soft_launch",
      delisted: true,
      mediaUrl: "/e.png",
      tokenId: "2",
      contractAddress: "0xabc",
      mintTxHash: "0x" + "cd".repeat(32),
    };

    expect(listingIsOnChainMinted(unmintedDraft)).toBe(false);
    expect(listingIsOnChainMinted(onChain)).toBe(true);
    expect(listingIsOnChainMinted(simulated)).toBe(false);

    // Owner and buyer both only see on-chain gallery items.
    expect(listingVisibleOnCollectionPage(unmintedDraft, true)).toBe(false);
    expect(listingVisibleOnCollectionPage(unmintedDraft, false)).toBe(false);
    expect(listingVisibleOnCollectionPage(softUnminted, true)).toBe(false);
    expect(listingVisibleOnCollectionPage(softUnminted, false)).toBe(false);
    expect(listingVisibleOnCollectionPage(onChain, true)).toBe(true);
    expect(listingVisibleOnCollectionPage(onChain, false)).toBe(true);
    expect(listingVisibleOnCollectionPage(simulated, false)).toBe(false);
    expect(listingVisibleOnCollectionPage(cancelledOnChain, false)).toBe(true);
  });
});

describe("cancel / relist (memory)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("cancels for seller and blocks strangers", async () => {
    vi.doMock("@/lib/db-ready", () => ({
      ensureDatabaseReady: async () => "memory",
    }));
    const listing = {
      id: "lst-1",
      creatorId: "c1",
      sellerId: "s1",
      delisted: false,
      currentHighBidUsd: null,
      priceUsd: 40,
      stage: "soft_launch" as const,
      softLaunchedAt: Date.now(),
    };
    const map = new Map([[listing.id, listing]]);
    vi.doMock("@/lib/data/memory-store", () => ({
      isMemoryMode: () => true,
      getMemoryEngine: () => ({ state: { listings: map } }),
    }));
    vi.doMock("@/lib/marketplace/service", () => ({
      getDiscoveryEngine: async () => ({
        state: { listings: map },
      }),
    }));
    vi.doMock("@/lib/marketplace/offers", () => ({
      listOffersForListing: async () => [],
      cancelOffer: async () => ({ ok: true }),
    }));

    const { cancelListingForSale, relistListingForSale } = await import(
      "@/lib/marketplace/listing-manage"
    );

    const denied = await cancelListingForSale({
      listingId: "lst-1",
      actorId: "stranger",
    });
    expect(denied.ok).toBe(false);

    const cancelled = await cancelListingForSale({
      listingId: "lst-1",
      actorId: "s1",
    });
    expect(cancelled.ok).toBe(true);
    expect(map.get("lst-1")?.delisted).toBe(true);

    const relisted = await relistListingForSale({
      listingId: "lst-1",
      actorId: "s1",
      priceUsd: 55,
    });
    expect(relisted.ok).toBe(true);
    expect(map.get("lst-1")?.delisted).toBe(false);
    expect(map.get("lst-1")?.priceUsd).toBe(55);
  });
});
