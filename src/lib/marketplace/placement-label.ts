/** Promoted (paid boost) vs editorial Featured — never conflate on cards. */

import type { Listing } from "@/lib/discovery/types";

export type PlacementLabel = "promoted" | "featured" | null;

/**
 * Paid Featured boost always surfaces as Promoted, even if stage is also featured.
 * Editorial Featured stays "Featured." Boost never feeds Rising fairness.
 */
export function placementLabel(
  listing: Pick<Listing, "stage" | "featuredBoostedAt">,
  bucket?: string,
): PlacementLabel {
  if (listing.featuredBoostedAt != null) return "promoted";
  if (listing.stage === "featured" || bucket === "featured") return "featured";
  return null;
}

export function placementBadgeText(label: PlacementLabel): string | null {
  if (label === "promoted") return "Promoted";
  if (label === "featured") return "Featured";
  return null;
}
