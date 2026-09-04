import { DISCOVERY_CONFIG } from "./config";
import { visibilityForStage } from "./staging";
import type { Listing } from "./types";

/**
 * Two-stage retrieve: cheap filter + recency/exposure sort before scoring.
 * Small catalogs pass through unchanged.
 */
export function retrieveRisingCandidates(
  listings: Iterable<Listing>,
  now = Date.now(),
): Listing[] {
  const eligible: Listing[] = [];
  for (const listing of listings) {
    if (listing.delisted) continue;
    if (!visibilityForStage(listing.stage).rising) continue;
    eligible.push(listing);
  }

  if (eligible.length <= DISCOVERY_CONFIG.risingCandidateLimit) {
    return eligible;
  }

  return eligible
    .map((listing) => ({
      listing,
      recency: listing.risingEligibleAt ?? listing.createdAt,
      exposure: listing.signals.impressionsThisWeek,
    }))
    .sort((a, b) => {
      if (a.exposure !== b.exposure) return a.exposure - b.exposure;
      return b.recency - a.recency;
    })
    .slice(0, DISCOVERY_CONFIG.risingCandidateLimit)
    .map((row) => row.listing);
}

export function retrieveFeaturedCandidates(
  listings: Iterable<Listing>,
): Listing[] {
  const eligible: Listing[] = [];
  for (const listing of listings) {
    if (listing.delisted) continue;
    const vis = visibilityForStage(listing.stage);
    if (!vis.featured && listing.stage !== "featured_eligible") continue;
    eligible.push(listing);
  }
  return eligible;
}
