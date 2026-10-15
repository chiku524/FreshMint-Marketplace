import type { Listing, NftTrait } from "@/lib/discovery/types";

/** One trait value’s share of the scored collection. */
export interface TraitRarity {
  trait_type: string;
  value: string;
  /** Pieces in the scored set that share this trait type + value. */
  count: number;
  /** count / scoredSize, 0–1. */
  frequency: number;
  /** Inverse frequency contribution: scoredSize / count. */
  score: number;
}

/** Per-piece rarity derived from collection-wide trait frequencies. */
export interface ListingRarity {
  listingId: string;
  /** Sum of inverse frequencies across the piece’s traits. Higher = rarer. */
  score: number;
  /** 1 = rarest among scored pieces. Null when the piece has no traits. */
  rank: number | null;
  /** Pieces included in the ranking (those with at least one trait). */
  scoredSize: number;
  /** Total pieces passed into the calculator (gallery inventory). */
  collectionSize: number;
  traits: TraitRarity[];
}

export interface CollectionRarityResult {
  /** True when at least one piece has traits — safe to show rarity UI. */
  hasTraits: boolean;
  scoredSize: number;
  collectionSize: number;
  /** listingId → rarity (unranked pieces still get an entry with rank null). */
  byListingId: Map<string, ListingRarity>;
}

function traitKey(trait_type: string, value: string): string {
  return `${trait_type}\0${value}`;
}

/**
 * Statistical rarity from collection trait distributions.
 *
 * Method (OpenSea / rarity.tools style):
 * 1. Score set = pieces with ≥1 trait. Collection size N = all pieces passed in
 *    (usually the collection gallery). Frequencies use N so missing a trait type
 *    still reflects how uncommon a value is across the whole set.
 * 2. For each trait value, frequency f = count(value) / N.
 * 3. Contribution = 1/f = N/count. Piece score = sum of contributions.
 * 4. Rank by score descending (rank 1 = rarest). Ties break by listing id.
 * 5. Pieces with no traits get score 0 and rank null — never invent rarity.
 */
export function computeCollectionRarity(
  listings: Pick<Listing, "id" | "traits">[],
): CollectionRarityResult {
  const collectionSize = listings.length;
  const valueCounts = new Map<string, number>();

  for (const listing of listings) {
    const seen = new Set<string>();
    for (const trait of listing.traits ?? []) {
      const type = trait.trait_type.trim();
      const value = trait.value.trim();
      if (!type || !value) continue;
      const key = traitKey(type, value);
      // Count each value once per piece even if duplicated on the listing.
      if (seen.has(key)) continue;
      seen.add(key);
      valueCounts.set(key, (valueCounts.get(key) ?? 0) + 1);
    }
  }

  const hasTraits = valueCounts.size > 0;
  const scoredListings = listings.filter((l) =>
    (l.traits ?? []).some((t) => t.trait_type.trim() && t.value.trim()),
  );
  const scoredSize = scoredListings.length;
  const denom = collectionSize > 0 ? collectionSize : 1;

  const scored: ListingRarity[] = scoredListings.map((listing) => {
    const traits = traitBreakdown(listing.traits ?? [], valueCounts, denom);
    const score = traits.reduce((sum, t) => sum + t.score, 0);
    return {
      listingId: listing.id,
      score,
      rank: null,
      scoredSize,
      collectionSize,
      traits,
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.listingId.localeCompare(b.listingId);
  });

  scored.forEach((row, index) => {
    row.rank = index + 1;
  });

  const byListingId = new Map<string, ListingRarity>();
  for (const row of scored) {
    byListingId.set(row.listingId, row);
  }

  // Unscored pieces: explicit empty entry so callers never invent ranks.
  for (const listing of listings) {
    if (byListingId.has(listing.id)) continue;
    byListingId.set(listing.id, {
      listingId: listing.id,
      score: 0,
      rank: null,
      scoredSize,
      collectionSize,
      traits: [],
    });
  }

  return { hasTraits, scoredSize, collectionSize, byListingId };
}

function traitBreakdown(
  traits: NftTrait[],
  valueCounts: Map<string, number>,
  collectionSize: number,
): TraitRarity[] {
  const out: TraitRarity[] = [];
  const seen = new Set<string>();
  for (const trait of traits) {
    const trait_type = trait.trait_type.trim();
    const value = trait.value.trim();
    if (!trait_type || !value) continue;
    const key = traitKey(trait_type, value);
    if (seen.has(key)) continue;
    seen.add(key);
    const count = valueCounts.get(key) ?? 0;
    if (count <= 0) continue;
    const frequency = count / collectionSize;
    out.push({
      trait_type,
      value,
      count,
      frequency,
      score: collectionSize / count,
    });
  }
  return out;
}

/** Compact label for cards: “#3 · 12”. Null when unranked. */
export function rarityRankLabel(rarity: ListingRarity | null | undefined): string | null {
  if (!rarity || rarity.rank == null || rarity.scoredSize <= 0) return null;
  return `#${rarity.rank}`;
}

/** Human percent for a trait frequency, e.g. 8.3%. */
export function formatTraitPercent(frequency: number): string {
  if (!Number.isFinite(frequency) || frequency <= 0) return "0%";
  const pct = frequency * 100;
  if (pct >= 10) return `${Math.round(pct)}%`;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
}

/** Short explainer shown near rarity UI. */
export const RARITY_METHOD_BLURB =
  "Rarity rank uses statistical rarity: each trait’s score is collection size ÷ how often that value appears; ranks sum those scores (1 = rarest). Pieces without traits are not ranked.";
