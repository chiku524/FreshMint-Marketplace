/** Client-safe homepage discovery weights and windows. */

export const HOME_TRENDING_COLLECTIONS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const HOME_HOT_WORKS_WINDOW_MS = 72 * 60 * 60 * 1000;

/** Score weights for Hot works (last 72h activity). */
export const HOME_HOT_WORKS_WEIGHTS = {
  view: 1,
  save: 5,
  bid: 8,
  purchase: 20,
} as const;

export const HOME_SECTION_LIMITS = {
  trendingCollections: 8,
  hotWorks: 12,
  englishEndingSoon: 8,
  timedDropsLive: 6,
  newCollections: 8,
} as const;

export type HotWorksActivity = {
  views: number;
  saves: number;
  bids: number;
  purchases: number;
};

export function scoreHotWork(
  activity: HotWorksActivity,
  weights: typeof HOME_HOT_WORKS_WEIGHTS = HOME_HOT_WORKS_WEIGHTS,
): number {
  return (
    Math.max(0, activity.views) * weights.view +
    Math.max(0, activity.saves) * weights.save +
    Math.max(0, activity.bids) * weights.bid +
    Math.max(0, activity.purchases) * weights.purchase
  );
}

export function isBuyableHomeListing(listing: {
  delisted?: boolean;
  stage?: string | null;
}): boolean {
  if (listing.delisted) return false;
  return listing.stage !== "draft";
}