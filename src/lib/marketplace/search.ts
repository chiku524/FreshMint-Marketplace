import type { Collection, CreatorProfile, Listing } from "@/lib/discovery/types";
import { visibilityForStage } from "@/lib/discovery/staging";

export type SearchHit =
  | { kind: "work"; listing: Listing }
  | { kind: "collection"; collection: Collection }
  | { kind: "creator"; creator: CreatorProfile };

export function normalizeSearchQuery(q: string | null | undefined): string {
  return (q ?? "").trim().toLowerCase().slice(0, 80);
}

export function searchCatalog(input: {
  query: string;
  listings: Iterable<Listing>;
  collections: Iterable<Collection>;
  creators: Iterable<CreatorProfile>;
  limit?: number;
}): SearchHit[] {
  const q = normalizeSearchQuery(input.query);
  if (!q) return [];
  const limit = input.limit ?? 36;
  const hits: SearchHit[] = [];

  for (const listing of input.listings) {
    if (listing.delisted || listing.stage === "draft") continue;
    if (!visibilityForStage(listing.stage).openLane) continue;
    if (
      listing.title.toLowerCase().includes(q) ||
      listing.description.toLowerCase().includes(q)
    ) {
      hits.push({ kind: "work", listing });
      if (hits.length >= limit) return hits;
    }
  }
  for (const collection of input.collections) {
    if (collection.title.toLowerCase().includes(q)) {
      hits.push({ kind: "collection", collection });
      if (hits.length >= limit) return hits;
    }
  }
  for (const creator of input.creators) {
    if (creator.displayName.toLowerCase().includes(q)) {
      hits.push({ kind: "creator", creator });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}

export type OpenLaneExtraFilters = {
  saleMode?: "fixed" | "timed_window" | "english";
  endingSoon?: boolean;
  now?: number;
  endingSoonMs?: number;
};

export const ENDING_SOON_MS = 48 * 60 * 60 * 1000;

export function listingMatchesOpenExtras(
  listing: Listing,
  filters: OpenLaneExtraFilters,
): boolean {
  const now = filters.now ?? Date.now();
  if (filters.saleMode) {
    const mode =
      listing.saleMode === "english" ||
      listing.saleMode === "timed_window" ||
      listing.saleMode === "fixed"
        ? listing.saleMode
        : listing.type === "auction"
          ? "timed_window"
          : "fixed";
    if (mode !== filters.saleMode) return false;
  }
  if (filters.endingSoon) {
    const ends = listing.auctionEndsAt;
    if (ends == null) return false;
    const window = filters.endingSoonMs ?? ENDING_SOON_MS;
    if (ends < now || ends - now > window) return false;
  }
  return true;
}
