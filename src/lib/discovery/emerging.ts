import { DISCOVERY_CONFIG } from "./config";
import type { CreatorProfile, Listing } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface EmergingResult {
  emerging: boolean;
  reasons: string[];
}

/**
 * Emerging = (volume OR sales OR tenure threshold) AND not flagged AND not wash.
 * External follower fame is intentionally ignored.
 * Verified creator badge is NOT required.
 */
export function isEmergingCreator(
  creator: CreatorProfile,
  now = Date.now(),
): EmergingResult {
  const reasons: string[] = [];

  if (creator.flagged) {
    return { emerging: false, reasons: ["creator_flagged"] };
  }
  if (creator.washCluster) {
    return { emerging: false, reasons: ["wash_cluster"] };
  }

  const { maxLifetimePrimaryVolumeUsd, maxCompletedSales, maxDaysSinceFirstListing } =
    DISCOVERY_CONFIG.emerging;

  const underVolume =
    creator.lifetimePrimaryVolumeUsd < maxLifetimePrimaryVolumeUsd;
  const underSales = creator.completedSales < maxCompletedSales;
  const withinWindow =
    creator.firstListingAt == null ||
    now - creator.firstListingAt <= maxDaysSinceFirstListing * MS_PER_DAY;

  if (underVolume) reasons.push("under_volume_threshold");
  if (underSales) reasons.push("under_sales_threshold");
  if (withinWindow) reasons.push("within_tenure_window");

  const emerging = underVolume || underSales || withinWindow;
  if (!emerging) {
    reasons.push("graduated_from_emerging");
  }

  return { emerging, reasons };
}

export function isEmergingListing(
  listing: Listing,
  creator: CreatorProfile,
  now = Date.now(),
): EmergingResult {
  if (listing.delisted) {
    return { emerging: false, reasons: ["listing_delisted"] };
  }
  return isEmergingCreator(creator, now);
}

/**
 * Artists who already dominate Featured must not monopolize Rising.
 */
export function blocksRisingDueToFeaturedDominance(
  creator: CreatorProfile,
  featuredCreatorIdsToday: Set<string>,
  featuredCountForCreator: number,
): boolean {
  if (!featuredCreatorIdsToday.has(creator.id)) return false;
  // More than one Featured slot today → blocked from additional Rising saturation.
  return featuredCountForCreator >= 1;
}
