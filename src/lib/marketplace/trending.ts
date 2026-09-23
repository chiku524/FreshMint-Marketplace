import { visibilityForStage } from "@/lib/discovery/staging";
import type { Listing } from "@/lib/discovery/types";

/**
 * Public works ordered by attention counters already stored on the listing.
 * Page views, then saves, then unique viewers. No separate trend index.
 */
export function rankTrendingListings(listings: Iterable<Listing>): Listing[] {
  return [...listings]
    .filter((listing) => {
      if (listing.delisted) return false;
      return visibilityForStage(listing.stage).openLane;
    })
    .sort((a, b) => {
      const byViews = b.signals.pageViews - a.signals.pageViews;
      if (byViews !== 0) return byViews;
      const bySaves = b.signals.saves - a.signals.saves;
      if (bySaves !== 0) return bySaves;
      const byViewers = b.signals.uniqueViewers - a.signals.uniqueViewers;
      if (byViewers !== 0) return byViewers;
      if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
      return a.id.localeCompare(b.id);
    });
}
