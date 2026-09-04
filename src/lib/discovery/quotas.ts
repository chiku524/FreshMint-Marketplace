import { DISCOVERY_CONFIG } from "./config";
import {
  blocksRisingDueToFeaturedDominance,
  isEmergingListing,
} from "./emerging";
import type { CreatorProfile, Listing, RankedListing } from "./types";

export interface SlotBudget {
  risingTotal: number;
  risingEmergingReserved: number;
  risingExplore: number;
  risingOpen: number;
  featuredTotal: number;
  liveAuctionStrip: number;
  maxConcurrentOeOnRising: number;
}

export function getDailySlotBudgets(): SlotBudget {
  const risingTotal = DISCOVERY_CONFIG.risingSlotsPerDay;
  const risingEmergingReserved = Math.ceil(
    risingTotal * DISCOVERY_CONFIG.emergingRisingQuota,
  );
  const risingExplore = Math.max(
    1,
    Math.floor(risingTotal * DISCOVERY_CONFIG.exploreRisingShare),
  );
  return {
    risingTotal,
    risingEmergingReserved,
    risingExplore,
    risingOpen: Math.max(0, risingTotal - risingEmergingReserved - risingExplore),
    featuredTotal: DISCOVERY_CONFIG.featuredSlotsPerDay,
    liveAuctionStrip: DISCOVERY_CONFIG.liveAuctionStripSlots,
    maxConcurrentOeOnRising: DISCOVERY_CONFIG.maxConcurrentOeOnRising,
  };
}

function isLiveFeatured(listing: Listing, now: number): boolean {
  if (listing.stage !== "featured" || listing.delisted) return false;
  if (
    listing.type === "auction" &&
    listing.auctionEndsAt != null &&
    listing.auctionEndsAt < now
  ) {
    return false;
  }
  return true;
}

/** Drop Rising candidates whose creator already holds live Featured inventory. */
export function excludeFeaturedDominantFromRising(
  ranked: RankedListing[],
  listings: Iterable<Listing>,
  creators: Map<string, CreatorProfile>,
  now = Date.now(),
): RankedListing[] {
  const featuredCreatorIds = new Set<string>();
  const featuredCounts = new Map<string, number>();
  for (const listing of listings) {
    if (!isLiveFeatured(listing, now)) continue;
    featuredCreatorIds.add(listing.creatorId);
    featuredCounts.set(
      listing.creatorId,
      (featuredCounts.get(listing.creatorId) ?? 0) + 1,
    );
  }

  return ranked.filter((item) => {
    const creator = creators.get(item.listing.creatorId);
    if (!creator) return false;
    return !blocksRisingDueToFeaturedDominance(
      creator,
      featuredCreatorIds,
      featuredCounts.get(creator.id) ?? 0,
    );
  });
}

/**
 * Enforce Emerging quota, then a low-exposure explore slice,
 * then remaining slots by fairness ranker order.
 */
export function applyEmergingQuota(
  ranked: RankedListing[],
  creators: Map<string, CreatorProfile>,
  now = Date.now(),
): RankedListing[] {
  const budget = getDailySlotBudgets();
  const emergingPool = ranked.filter((r) => {
    const creator = creators.get(r.listing.creatorId);
    if (!creator) return false;
    return isEmergingListing(r.listing, creator, now).emerging;
  });
  const generalPool = ranked.filter((r) => !emergingPool.includes(r));

  const selected: RankedListing[] = [];
  const usedIds = new Set<string>();

  for (const item of emergingPool) {
    if (selected.length >= budget.risingEmergingReserved) break;
    if (usedIds.has(item.listing.id)) continue;
    selected.push({ ...item, emerging: true, bucket: "rising" });
    usedIds.add(item.listing.id);
  }

  const explorePool = emergingPool
    .filter((r) => !usedIds.has(r.listing.id))
    .sort((a, b) => {
      const ia = a.listing.signals.impressionsThisWeek;
      const ib = b.listing.signals.impressionsThisWeek;
      if (ia !== ib) return ia - ib;
      return a.listing.id.localeCompare(b.listing.id);
    });

  let exploreTaken = 0;
  for (const item of explorePool) {
    if (exploreTaken >= budget.risingExplore) break;
    if (selected.length >= budget.risingTotal) break;
    selected.push({
      ...item,
      emerging: true,
      bucket: "rising",
      reasons: [...item.reasons, "explore"],
    });
    usedIds.add(item.listing.id);
    exploreTaken += 1;
  }

  const remainder = [...emergingPool, ...generalPool]
    .filter((r) => !usedIds.has(r.listing.id))
    .sort((a, b) => b.score - a.score);

  for (const item of remainder) {
    if (selected.length >= budget.risingTotal) break;
    const creator = creators.get(item.listing.creatorId);
    const emerging = creator
      ? isEmergingListing(item.listing, creator, now).emerging
      : false;
    selected.push({ ...item, emerging, bucket: "rising" });
    usedIds.add(item.listing.id);
  }

  return selected;
}

export function capConcurrentOpenEditions(
  ranked: RankedListing[],
  now = Date.now(),
): RankedListing[] {
  const max = DISCOVERY_CONFIG.maxConcurrentOeOnRising;
  let oeCount = 0;
  return ranked.filter((r) => {
    if (r.listing.type !== "open_edition") return true;
    const live =
      r.listing.oeStartsAt != null &&
      r.listing.oeEndsAt != null &&
      now >= r.listing.oeStartsAt &&
      now <= r.listing.oeEndsAt;
    if (!live) return true;
    if (oeCount >= max) return false;
    oeCount += 1;
    return true;
  });
}

export function selectFeaturedSlots(
  candidates: RankedListing[],
): RankedListing[] {
  return candidates
    .filter(
      (c) =>
        c.listing.stage === "featured" ||
        c.listing.stage === "featured_eligible",
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, DISCOVERY_CONFIG.featuredSlotsPerDay)
    .map((c) => ({ ...c, bucket: "featured" as const }));
}

export function selectLiveAuctionStrip(
  listings: Listing[],
  now = Date.now(),
): Listing[] {
  return listings
    .filter(
      (l) =>
        l.type === "auction" &&
        !l.delisted &&
        l.auctionStartsAt != null &&
        l.auctionEndsAt != null &&
        now >= l.auctionStartsAt &&
        now <= l.auctionEndsAt &&
        (l.stage === "soft_launch" ||
          l.stage === "rising_eligible" ||
          l.stage === "featured_eligible" ||
          l.stage === "featured"),
    )
    .sort((a, b) => (a.auctionEndsAt ?? 0) - (b.auctionEndsAt ?? 0))
    .slice(0, DISCOVERY_CONFIG.liveAuctionStripSlots);
}

export function emergingShare(selected: RankedListing[]): number {
  if (selected.length === 0) return 0;
  return selected.filter((s) => s.emerging).length / selected.length;
}
