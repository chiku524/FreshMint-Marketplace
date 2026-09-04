import { DISCOVERY_CONFIG } from "./config";
import type { CreatorProfile, Listing } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface EmergingResult {
  emerging: boolean;
  reasons: string[];
  /** How many of the three graduation thresholds this creator has exceeded. */
  exceededCount: number;
}

/**
 * Emerging = not flagged/wash AND fewer than N graduation thresholds exceeded.
 * Default N=2 (two-of-three). External follower fame is ignored.
 * Verified creator badge is NOT required.
 */
export function isEmergingCreator(
  creator: CreatorProfile,
  now = Date.now(),
): EmergingResult {
  const reasons: string[] = [];

  if (creator.flagged) {
    return { emerging: false, reasons: ["creator_flagged"], exceededCount: 3 };
  }
  if (creator.washCluster) {
    return { emerging: false, reasons: ["wash_cluster"], exceededCount: 3 };
  }

  const {
    maxLifetimePrimaryVolumeUsd,
    maxCompletedSales,
    maxDaysSinceFirstListing,
    graduationThresholdsRequired,
  } = DISCOVERY_CONFIG.emerging;

  const underVolume =
    creator.lifetimePrimaryVolumeUsd < maxLifetimePrimaryVolumeUsd;
  const underSales = creator.completedSales < maxCompletedSales;
  const withinWindow =
    creator.firstListingAt == null ||
    now - creator.firstListingAt <= maxDaysSinceFirstListing * MS_PER_DAY;

  if (underVolume) reasons.push("under_volume_threshold");
  if (underSales) reasons.push("under_sales_threshold");
  if (withinWindow) reasons.push("within_tenure_window");

  let exceededCount = 0;
  if (!underVolume) {
    exceededCount += 1;
    reasons.push("exceeded_volume_threshold");
  }
  if (!underSales) {
    exceededCount += 1;
    reasons.push("exceeded_sales_threshold");
  }
  if (!withinWindow) {
    exceededCount += 1;
    reasons.push("exceeded_tenure_window");
  }

  const emerging = exceededCount < graduationThresholdsRequired;
  if (!emerging) {
    reasons.push("graduated_two_of_three");
  }

  return { emerging, reasons, exceededCount };
}

export function isEmergingListing(
  listing: Listing,
  creator: CreatorProfile,
  now = Date.now(),
): EmergingResult {
  if (listing.delisted) {
    return { emerging: false, reasons: ["listing_delisted"], exceededCount: 0 };
  }
  return isEmergingCreator(creator, now);
}

/**
 * Artists who already hold a live Featured slot must not monopolize Rising.
 * Ended/sold auctions in Featured stage do not count as current inventory.
 */
export function blocksRisingDueToFeaturedDominance(
  creator: CreatorProfile,
  featuredCreatorIdsToday: Set<string>,
  featuredCountForCreator: number,
): boolean {
  if (!featuredCreatorIdsToday.has(creator.id)) return false;
  return featuredCountForCreator >= 1;
}
