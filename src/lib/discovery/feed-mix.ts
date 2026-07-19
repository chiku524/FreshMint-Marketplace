import { DISCOVERY_CONFIG, type FeedMixKey } from "./config";
import { scoreListing } from "./scoring";
import { visibilityForStage } from "./staging";
import type {
  CreatorProfile,
  FeedBucket,
  FollowGraph,
  Listing,
  RankedListing,
  SessionContext,
  Shelf,
} from "./types";

export interface FeedMixPlan {
  total: number;
  counts: Record<FeedBucket, number>;
}

/** Build integer slot counts from mix ratios for a page size. */
export function planFeedMix(pageSize: number): FeedMixPlan {
  const keys = Object.keys(DISCOVERY_CONFIG.feedMix) as FeedMixKey[];
  const raw = keys.map((k) => ({
    key: k,
    exact: pageSize * DISCOVERY_CONFIG.feedMix[k],
  }));

  const counts = {
    emerging_rising: 0,
    following: 0,
    featured: 0,
    auctions_live: 0,
  } as Record<FeedBucket, number>;

  let allocated = 0;
  for (const row of raw) {
    const n = Math.floor(row.exact);
    counts[row.key] = n;
    allocated += n;
  }

  // Distribute remainder by largest fractional part.
  const remainders = raw
    .map((r) => ({ key: r.key, frac: r.exact - Math.floor(r.exact) }))
    .sort((a, b) => b.frac - a.frac);

  let left = pageSize - allocated;
  for (const r of remainders) {
    if (left <= 0) break;
    counts[r.key] += 1;
    left -= 1;
  }

  return { total: pageSize, counts };
}

function applySessionDiversity(
  candidates: RankedListing[],
  session: SessionContext,
): RankedListing[] {
  const artistCounts = new Map<string, number>();
  const collectionCounts = new Map<string, number>();
  const out: RankedListing[] = [];

  for (const id of session.seenArtistIds) {
    artistCounts.set(id, (artistCounts.get(id) ?? 0) + 1);
  }
  for (const id of session.seenCollectionIds) {
    collectionCounts.set(id, (collectionCounts.get(id) ?? 0) + 1);
  }

  for (const item of candidates) {
    const artistN = artistCounts.get(item.listing.creatorId) ?? 0;
    if (artistN >= DISCOVERY_CONFIG.maxArtistPerScreen) continue;

    if (item.listing.collectionId) {
      const colN = collectionCounts.get(item.listing.collectionId) ?? 0;
      if (colN >= DISCOVERY_CONFIG.maxCollectionFloodPerSession) continue;
    }

    // Also enforce one artist per screen within this page build.
    const onPage = out.filter(
      (o) => o.listing.creatorId === item.listing.creatorId,
    ).length;
    if (onPage >= DISCOVERY_CONFIG.maxArtistPerScreen) continue;

    out.push(item);
    artistCounts.set(item.listing.creatorId, artistN + 1);
    if (item.listing.collectionId) {
      collectionCounts.set(
        item.listing.collectionId,
        (collectionCounts.get(item.listing.collectionId) ?? 0) + 1,
      );
    }
  }

  return out;
}

function rankPool(
  listings: Listing[],
  creators: Map<string, CreatorProfile>,
  session: SessionContext,
  bucket: FeedBucket | "rising" | "open" | "featured",
  now: number,
): RankedListing[] {
  const ranked: RankedListing[] = [];
  for (const listing of listings) {
    const creator = creators.get(listing.creatorId);
    if (!creator || listing.delisted) continue;
    const breakdown = scoreListing(listing, creator, session, now);
    ranked.push({
      listing,
      score: breakdown.score,
      bucket,
      emerging: breakdown.emerging,
      reasons: breakdown.reasons,
    });
  }
  return ranked.sort((a, b) => b.score - a.score);
}

export interface ComposeFeedInput {
  listings: Listing[];
  creators: Map<string, CreatorProfile>;
  follows?: FollowGraph | null;
  shelves?: Shelf[];
  risingPool: RankedListing[];
  featuredPool: RankedListing[];
  session: SessionContext;
  pageSize?: number;
  now?: number;
}

/**
 * Composed homepage feed — NOT a global activity firehose.
 * Hard mix: 40% Emerging Rising · 25% Following · 20% Featured · 15% Auctions/live
 */
export function composeHomepageFeed(input: ComposeFeedInput): RankedListing[] {
  const now = input.now ?? Date.now();
  const pageSize = input.pageSize ?? 20;
  const plan = planFeedMix(pageSize);

  const emergingRising = applySessionDiversity(
    input.risingPool.filter((r) => r.emerging),
    input.session,
  ).slice(0, plan.counts.emerging_rising);

  const followedArtistIds = new Set(input.follows?.followedArtistIds ?? []);
  const shelfListingIds = new Set<string>();
  for (const shelf of input.shelves ?? []) {
    if (input.follows?.followedShelfIds.includes(shelf.id)) {
      for (const id of shelf.listingIds) shelfListingIds.add(id);
    }
  }

  const followingListings = input.listings.filter((l) => {
    const vis = visibilityForStage(l.stage);
    if (!vis.openLane && !vis.rising && !vis.featured) return false;
    return (
      followedArtistIds.has(l.creatorId) || shelfListingIds.has(l.id)
    );
  });

  const following = applySessionDiversity(
    rankPool(followingListings, input.creators, input.session, "following", now),
    {
      ...input.session,
      seenListingIds: [
        ...input.session.seenListingIds,
        ...emergingRising.map((r) => r.listing.id),
      ],
      seenArtistIds: [
        ...input.session.seenArtistIds,
        ...emergingRising.map((r) => r.listing.creatorId),
      ],
    },
  ).slice(0, plan.counts.following);

  const used = new Set([
    ...emergingRising.map((r) => r.listing.id),
    ...following.map((r) => r.listing.id),
  ]);

  const featured = applySessionDiversity(
    input.featuredPool.filter((r) => !used.has(r.listing.id)),
    input.session,
  ).slice(0, plan.counts.featured);
  for (const f of featured) used.add(f.listing.id);

  const liveAuctions = input.listings.filter((l) => {
    if (used.has(l.id) || l.type !== "auction" || l.delisted) return false;
    if (l.auctionStartsAt == null || l.auctionEndsAt == null) return false;
    return now >= l.auctionStartsAt && now <= l.auctionEndsAt;
  });

  const auctions = applySessionDiversity(
    rankPool(
      liveAuctions,
      input.creators,
      input.session,
      "auctions_live",
      now,
    ),
    input.session,
  ).slice(0, plan.counts.auctions_live);

  // Interleave by mix order for a composed page (not stacked silos only).
  const queues: Record<FeedBucket, RankedListing[]> = {
    emerging_rising: emergingRising.map((r) => ({
      ...r,
      bucket: "emerging_rising" as const,
    })),
    following: following.map((r) => ({ ...r, bucket: "following" as const })),
    featured: featured.map((r) => ({ ...r, bucket: "featured" as const })),
    auctions_live: auctions.map((r) => ({
      ...r,
      bucket: "auctions_live" as const,
    })),
  };

  const order: FeedBucket[] = [
    "emerging_rising",
    "following",
    "featured",
    "auctions_live",
  ];
  const result: RankedListing[] = [];
  let progress = true;
  while (result.length < pageSize && progress) {
    progress = false;
    for (const bucket of order) {
      if (queues[bucket].length === 0) continue;
      // Respect remaining planned counts loosely while filling.
      const planned = plan.counts[bucket];
      const have = result.filter((r) => r.bucket === bucket).length;
      if (have >= planned) continue;
      const next = queues[bucket].shift();
      if (!next) continue;
      // Final per-screen artist constraint.
      if (
        result.some(
          (r) => r.listing.creatorId === next.listing.creatorId,
        )
      ) {
        continue;
      }
      result.push(next);
      progress = true;
      if (result.length >= pageSize) break;
    }
  }

  // Backfill from any remaining queues if short.
  if (result.length < pageSize) {
    const leftovers = order.flatMap((b) => queues[b]);
    for (const item of leftovers) {
      if (result.length >= pageSize) break;
      if (result.some((r) => r.listing.id === item.listing.id)) continue;
      if (
        result.some((r) => r.listing.creatorId === item.listing.creatorId)
      ) {
        continue;
      }
      result.push(item);
    }
  }

  return result;
}

export function filterOpenLane(
  listings: Listing[],
  filters: {
    chain?: "evm" | "solana";
    network?: Listing["network"];
    medium?: string;
    style?: string;
    maxPriceUsd?: number;
    minPriceUsd?: number;
    type?: Listing["type"];
    query?: string;
  },
): Listing[] {
  return listings.filter((l) => {
    const vis = visibilityForStage(l.stage);
    if (!vis.openLane || l.delisted) return false;
    if (filters.chain && l.chain !== filters.chain) return false;
    if (filters.network && l.network !== filters.network) return false;
    if (filters.medium && l.medium !== filters.medium) return false;
    if (filters.type && l.type !== filters.type) return false;
    if (filters.style && !l.styleTags.includes(filters.style)) return false;
    if (filters.maxPriceUsd != null && (l.priceUsd ?? Infinity) > filters.maxPriceUsd) {
      return false;
    }
    if (filters.minPriceUsd != null && (l.priceUsd ?? 0) < filters.minPriceUsd) {
      return false;
    }
    if (filters.query) {
      const q = filters.query.toLowerCase();
      const hay = `${l.title} ${l.description} ${l.styleTags.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Verify feed mix ratios within tolerance for tests / monitoring. */
export function measureFeedMix(items: RankedListing[]): Record<FeedBucket, number> {
  const totals: Record<FeedBucket, number> = {
    emerging_rising: 0,
    following: 0,
    featured: 0,
    auctions_live: 0,
  };
  for (const item of items) {
    if (item.bucket in totals) {
      totals[item.bucket as FeedBucket] += 1;
    }
  }
  const n = items.length || 1;
  return {
    emerging_rising: totals.emerging_rising / n,
    following: totals.following / n,
    featured: totals.featured / n,
    auctions_live: totals.auctions_live / n,
  };
}
