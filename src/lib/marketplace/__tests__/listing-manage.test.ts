import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canManageListing,
  listingHasPublicSurface,
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

  it("shows all collection pieces to owner; hides drafts from buyers", () => {
    const draft = { stage: "draft", delisted: false, mediaUrl: "/a.png" };
    const soft = { stage: "soft_launch", delisted: false, mediaUrl: "/b.png" };
    const cancelledPublic = {
      stage: "soft_launch",
      delisted: true,
      mediaUrl: "/c.png",
    };
    const cancelledEmpty = {
      stage: "soft_launch",
      delisted: true,
      mediaUrl: null,
      tokenId: null,
      contractAddress: null,
      mintTxHash: null,
    };

    expect(listingVisibleOnCollectionPage(draft, true)).toBe(true);
    expect(listingVisibleOnCollectionPage(soft, true)).toBe(true);
    expect(listingVisibleOnCollectionPage(cancelledPublic, true)).toBe(true);
    expect(listingVisibleOnCollectionPage(cancelledEmpty, true)).toBe(true);

    expect(listingVisibleOnCollectionPage(draft, false)).toBe(false);
    expect(listingVisibleOnCollectionPage(soft, false)).toBe(true);
    expect(listingVisibleOnCollectionPage(cancelledPublic, false)).toBe(true);
    expect(listingVisibleOnCollectionPage(cancelledEmpty, false)).toBe(false);
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
