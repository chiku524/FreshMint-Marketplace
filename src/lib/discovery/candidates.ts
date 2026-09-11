import { DISCOVERY_CONFIG } from "./config";
import { visibilityForStage } from "./staging";
import type { Listing } from "./types";

/**
 * Two-stage retrieve: cheap filter, then a mix of never-shown and
 * recent work so a large catalog cannot bury either debut or fresh drops.
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

  const limit = DISCOVERY_CONFIG.risingCandidateLimit;
  if (eligible.length <= limit) {
    return eligible;
  }

  const rows = eligible.map((listing) => ({
    listing,
    recency: listing.risingEligibleAt ?? listing.createdAt,
    exposure: listing.signals.impressionsThisWeek,
  }));

  const byExposure = [...rows].sort((a, b) => {
    if (a.exposure !== b.exposure) return a.exposure - b.exposure;
    if (a.recency !== b.recency) return b.recency - a.recency;
    return a.listing.id.localeCompare(b.listing.id);
  });
  const byRecency = [...rows].sort((a, b) => {
    if (a.recency !== b.recency) return b.recency - a.recency;
    return a.listing.id.localeCompare(b.listing.id);
  });

  const picked = new Set<string>();
  const out: Listing[] = [];
  const exposureShare = Math.ceil(limit / 2);

  for (const row of byExposure) {
    if (out.length >= exposureShare) break;
    picked.add(row.listing.id);
    out.push(row.listing);
  }
  for (const row of byRecency) {
    if (out.length >= limit) break;
    if (picked.has(row.listing.id)) continue;
    picked.add(row.listing.id);
    out.push(row.listing);
  }
  if (out.length < limit) {
    for (const row of byExposure) {
      if (out.length >= limit) break;
      if (picked.has(row.listing.id)) continue;
      picked.add(row.listing.id);
      out.push(row.listing);
    }
  }

  return out;
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
