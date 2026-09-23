import type { Collection, Listing } from "@/lib/discovery/types";

export type TrendingCollectionStripItem = {
  collection: Collection;
  listingCount: number;
  topPageViews: number;
};

/**
 * Group ranked trending listings by collectionId (no new backend).
 * Order by first appearance in the ranked list (attention order).
 */
export function trendingCollectionsFromRanked(
  ranked: Listing[],
  collections: Map<string, Collection>,
  limit = 8,
): TrendingCollectionStripItem[] {
  const seen = new Map<string, TrendingCollectionStripItem>();
  for (const listing of ranked) {
    const id = listing.collectionId;
    if (!id) continue;
    const collection = collections.get(id);
    if (!collection) continue;
    const existing = seen.get(id);
    if (existing) {
      existing.listingCount += 1;
      existing.topPageViews = Math.max(
        existing.topPageViews,
        listing.signals.pageViews,
      );
    } else {
      seen.set(id, {
        collection,
        listingCount: 1,
        topPageViews: listing.signals.pageViews,
      });
    }
  }
  return [...seen.values()].slice(0, limit);
}
