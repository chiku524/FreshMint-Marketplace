import { DISCOVERY_CONFIG } from "./config";
import type { FollowGraph, Listing } from "./types";

export interface ViewerTaste {
  styleTags: string[];
  medium?: string | null;
  maxPriceUsd?: number | null;
}

export function normalizeTaste(input: Partial<ViewerTaste> | null | undefined): ViewerTaste {
  const allowed = new Set<string>(DISCOVERY_CONFIG.taste.seedTags);
  const styleTags = (input?.styleTags ?? [])
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && (allowed.has(t) || t.length <= 24))
    .slice(0, 8);
  return {
    styleTags: [...new Set(styleTags)],
    medium: input?.medium?.trim() || null,
    maxPriceUsd:
      input?.maxPriceUsd != null && Number.isFinite(input.maxPriceUsd)
        ? input.maxPriceUsd
        : null,
  };
}

export function hasTaste(taste: ViewerTaste | null | undefined): boolean {
  return Boolean(
    taste &&
      (taste.styleTags.length > 0 || taste.medium || taste.maxPriceUsd != null),
  );
}

/**
 * Taste affinity is a multiplier applied only to Emerging homepage slots.
 * No taste → 1 (global Rising order unchanged).
 */
export function computeTasteAffinity(
  listing: Listing,
  taste: ViewerTaste | null | undefined,
): number {
  if (!hasTaste(taste)) return 1;
  const { affinityBoostPerTag, noOverlapPenalty, mediumBoost } =
    DISCOVERY_CONFIG.taste;

  const listingTags = new Set(listing.styleTags.map((t) => t.toLowerCase()));
  const overlap = (taste!.styleTags ?? []).filter((t) => listingTags.has(t));
  let score =
    overlap.length > 0
      ? 1 + affinityBoostPerTag * overlap.length
      : noOverlapPenalty;

  if (taste!.medium && listing.medium === taste!.medium) {
    score *= mediumBoost;
  }

  if (
    taste!.maxPriceUsd != null &&
    listing.priceUsd != null &&
    listing.priceUsd <= taste!.maxPriceUsd
  ) {
    score *= 1.06;
  }

  return score;
}

/** Infer taste from followed artists' listings (signed-in cold start). */
export function inferTasteFromCatalog(
  follows: FollowGraph | null | undefined,
  listings: Iterable<Listing>,
): ViewerTaste {
  if (!follows) return { styleTags: [] };
  const followed = new Set(follows.followedArtistIds);
  if (followed.size === 0) return { styleTags: [] };

  const counts = new Map<string, number>();
  const mediums = new Map<string, number>();
  for (const listing of listings) {
    if (!followed.has(listing.creatorId) || listing.delisted) continue;
    for (const tag of listing.styleTags) {
      const key = tag.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    mediums.set(listing.medium, (mediums.get(listing.medium) ?? 0) + 1);
  }

  const styleTags = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  const medium = [...mediums.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return normalizeTaste({ styleTags, medium });
}
