import { describe, expect, it } from "vitest";
import type { Collection, Listing } from "@/lib/discovery/types";
import {
  buildCreatorProfileCollections,
  collectionVisibleOnCreatorProfile,
  countUnpublishedOwnedCollections,
  mintedPublishedListingsInCollection,
} from "@/lib/marketplace/profile-collections";

function listing(partial: Partial<Listing> & Pick<Listing, "id">): Listing {
  return {
    title: partial.title ?? `piece ${partial.id}`,
    description: "",
    creatorId: "u1",
    type: "single",
    chain: "evm",
    network: "base",
    stage: "soft_launch",
    priceUsd: 25,
    medium: "",
    styleTags: [],
    mediaHash: "h",
    mediaUrl: "/uploads/a.png",
    metadataComplete: true,
    originalMedia: true,
    createdAt: 2,
    softLaunchedAt: 1,
    risingEligibleAt: null,
    featuredAt: null,
    featuredBoostedAt: null,
    oeStartsAt: null,
    oeEndsAt: null,
    auctionStartsAt: null,
    auctionEndsAt: null,
    collectionId: "col-live",
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
    tokenId: "1",
    contractAddress: "0xabc",
    mintTxHash: "0xmint",
    ...partial,
  };
}

describe("profile-collections", () => {
  it("hides collections with only drafts or unminted pieces", () => {
    expect(
      collectionVisibleOnCreatorProfile([
        {
          stage: "draft",
          tokenId: "1",
          contractAddress: "0xabc",
          mintTxHash: "0xmint",
        },
        {
          stage: "soft_launch",
          tokenId: null,
          contractAddress: null,
          mintTxHash: null,
        },
      ]),
    ).toBe(false);
  });

  it("shows collections with at least one minted published piece", () => {
    expect(collectionVisibleOnCreatorProfile([listing({ id: "a" })])).toBe(
      true,
    );
  });

  it("counts only minted published listings for profile surfaces", () => {
    const pieces = mintedPublishedListingsInCollection([
      listing({ id: "a", createdAt: 2 }),
      listing({
        id: "b",
        stage: "draft",
        tokenId: "2",
        mintTxHash: "0xmint2",
        createdAt: 3,
      }),
      listing({
        id: "c",
        stage: "rising_eligible",
        tokenId: "3",
        mintTxHash: "0xmint3",
        createdAt: 1,
      }),
    ]);
    expect(pieces.map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("builds browse models only for minted collections", () => {
    const live: Collection = {
      id: "col-live",
      title: "Live set",
      slug: "live-set",
      creatorId: "u1",
      chain: "evm",
      network: "base",
      heroListingId: "a",
      sampleListingIds: ["a"],
      totalItems: 2,
      imageUrl: null,
    };
    const draftOnly: Collection = {
      id: "col-draft",
      title: "Draft set",
      slug: "draft-set",
      creatorId: "u1",
      chain: "evm",
      network: "base",
      heroListingId: null,
      sampleListingIds: [],
      totalItems: 1,
    };
    const listings = [
      listing({ id: "a", collectionId: "col-live" }),
      listing({
        id: "draft-piece",
        collectionId: "col-draft",
        stage: "draft",
        tokenId: null,
        contractAddress: null,
        mintTxHash: null,
      }),
    ];
    const built = buildCreatorProfileCollections({
      collections: [live, draftOnly],
      listings,
      volumes: new Map([["col-live", 100]]),
    });
    expect(built).toHaveLength(1);
    expect(built[0]?.id).toBe("col-live");
    expect(built[0]?.totalItems).toBe(1);
    expect(built[0]?.volumeUsd).toBe(100);
    expect(
      countUnpublishedOwnedCollections({
        collections: [live, draftOnly],
        listings,
        creatorId: "u1",
      }),
    ).toBe(1);
  });
});
