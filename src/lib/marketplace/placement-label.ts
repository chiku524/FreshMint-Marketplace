/** Promoted (paid boost) vs editorial Featured — never conflate on cards. */

import type { Listing } from "@/lib/discovery/types";

export type PlacementLabel = "promoted" | "featured" | "secondary" | null;

/**
 * Paid Featured boost always surfaces as Promoted, even if stage is also featured.
 * Editorial Featured stays "Featured." Boost never feeds Rising fairness.
 * Secondary resales get a Secondary badge (checked first after promoted).
 */
export function placementLabel(
  listing: Pick<Listing, "stage" | "featuredBoostedAt" | "isSecondary">,
  bucket?: string,
): PlacementLabel {
  if (listing.featuredBoostedAt != null) return "promoted";
  if (listing.isSecondary) return "secondary";
  if (listing.stage === "featured" || bucket === "featured") return "featured";
  return null;
}

export function placementBadgeText(label: PlacementLabel): string | null {
  if (label === "promoted") return "Promoted";
  if (label === "secondary") return "Secondary";
  if (label === "featured") return "Featured";
  return null;
}
