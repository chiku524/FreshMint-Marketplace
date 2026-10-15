import type { Collection, Listing } from "@/lib/discovery/types";
import { getNetwork, resolveNetwork } from "@/lib/chains/registry";
import { listingVisibleOnCollectionPage } from "@/lib/marketplace/listing-manage";

export type ProfileCollectionListing = {
  stage?: string | null;
  delisted?: boolean;
  mediaUrl?: string | null;
  tokenId?: string | null;
  contractAddress?: string | null;
  mintTxHash?: string | null;
  id?: string;
  createdAt?: number;
};

export type BuiltProfileCollection = {
  id: string;
  title: string;
  slug?: string | null;
  totalItems: number;
  chain: string;
  coverUrl: string | null;
  volumeUsd: number;
  sampleListings: Listing[];
  sortAt: number;
};

/**
 * Creator public profile shows minted/published collections only —
 * at least one on-chain minted, non-draft piece (same gate as collection Items).
 */
export function collectionVisibleOnCreatorProfile(
  listings: ProfileCollectionListing[],
): boolean {
  return listings.some((listing) =>
    listingVisibleOnCollectionPage(listing, false),
  );
}

/** Minted + published pieces for profile covers / item counts. */
export function mintedPublishedListingsInCollection<
  T extends ProfileCollectionListing,
>(listings: T[]): T[] {
  return listings
    .filter((listing) => listingVisibleOnCollectionPage(listing, false))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/**
 * Build the collections browse models for a creator (public profile or /me).
 * Only minted/published collections; piece samples are optional gallery drill-in.
 */
export function buildCreatorProfileCollections(input: {
  collections: Collection[];
  listings: Listing[];
  volumes?: Map<string, number>;
  sampleLimit?: number;
}): BuiltProfileCollection[] {
  const sampleLimit = input.sampleLimit ?? 6;
  const volumes = input.volumes ?? new Map<string, number>();

  return input.collections
    .flatMap((collection) => {
      const inCollection = input.listings.filter(
        (l) => l.collectionId === collection.id,
      );
      if (!collectionVisibleOnCreatorProfile(inCollection)) return [];

      const minted = mintedPublishedListingsInCollection(inCollection);
      const heroId = collection.heroListingId;
      const hero =
        minted.find((l) => l.id === heroId) ??
        minted.find((l) => l.mediaUrl) ??
        minted[0] ??
        null;

      return [
        {
          id: collection.id,
          title: collection.title,
          slug: collection.slug,
          totalItems: minted.length,
          chain: getNetwork(
            resolveNetwork(collection.network, collection.chain),
          ).label,
          coverUrl: collection.imageUrl || hero?.mediaUrl || null,
          volumeUsd: volumes.get(collection.id) ?? 0,
          sampleListings: minted.slice(0, sampleLimit) as Listing[],
          sortAt: hero?.createdAt ?? collection.createdAt ?? 0,
        },
      ];
    })
    .sort((a, b) => b.sortAt - a.sortAt);
}

/** Owned collections that are not yet visible on the public/minted profile. */
export function countUnpublishedOwnedCollections(input: {
  collections: Collection[];
  listings: Listing[];
  creatorId: string;
}): number {
  return input.collections.filter((collection) => {
    if (collection.creatorId !== input.creatorId) return false;
    const inCollection = input.listings.filter(
      (l) => l.collectionId === collection.id,
    );
    return !collectionVisibleOnCreatorProfile(inCollection);
  }).length;
}
