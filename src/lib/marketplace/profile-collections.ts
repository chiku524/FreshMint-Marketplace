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
