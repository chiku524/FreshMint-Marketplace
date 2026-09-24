/**
 * Homepage marketplace discovery: trending collections, hot works, live auctions.
 * Pure rankers are client-safe; loaders hit Prisma / discovery engine.
 */
import { prisma } from "@/lib/db";
import type { Listing } from "@/lib/discovery/types";
import { selectLiveAuctionStrip } from "@/lib/discovery/quotas";
import {
  aggregateCollectionVolumesUsd,
  aggregateCollectionVolumesUsdSince,
  listNewCollectionsThisWeek,
  type CollectionBrowseRow,
} from "@/lib/marketplace/collections-browse";
import {
  HOME_HOT_WORKS_WEIGHTS,
  HOME_HOT_WORKS_WINDOW_MS,
  HOME_SECTION_LIMITS,
  HOME_TRENDING_COLLECTIONS_WINDOW_MS,
  isBuyableHomeListing,
  scoreHotWork,
  type HotWorksActivity,
} from "@/lib/marketplace/home-discovery-config";
import { resolveSaleMode } from "@/lib/marketplace/sale-mode";
import { rankTrendingListings } from "@/lib/marketplace/trending";

export type HomeCollectionSource = "trending_7d" | "top_volume" | "new_this_week";

export type HomeCollectionCardModel = {
  id: string;
  title: string;
  creatorId: string;
  creatorName: string;
  chain: string;
  totalItems: number;
  volumeUsd: number;
  volumeLabel: "7d" | "all-time";
  floorUsd: number | null;
  coverUrl: string | null;
  source: HomeCollectionSource;
};

export type HomeCollectionsSection = {
  items: HomeCollectionCardModel[];
  /** Honest label: only "trending" when every item is 7d volume-backed. */
  subtitleMode: "trending" | "top_volume" | "new" | "mixed";
  viewAllHref: string;
};

export type HotWorksSection = {
  items: Listing[];
  subtitleMode: "hot" | "most_viewed" | "newest" | "mixed";
  viewAllHref: string;
};

export type HomeDiscoveryPayload = {
  collections: HomeCollectionsSection;
  hotWorks: HotWorksSection;
  englishEndingSoon: Listing[];
  timedDropsLive: Listing[];
  newCollections: HomeCollectionCardModel[];
};

export function rankByVolumeDesc(
  entries: Array<{ id: string; volumeUsd: number }>,
): Array<{ id: string; volumeUsd: number }> {
  return [...entries]
    .filter((e) => Number(e.volumeUsd) > 0)
    .sort(
      (a, b) =>
        b.volumeUsd - a.volumeUsd || a.id.localeCompare(b.id),
    );
}

/**
 * Fill to `limit` with honest sources: trending_7d first, then top all-time,
 * then new-this-week. Never relabels filler as trending.
 */
export function fillCollectionDiscovery(input: {
  trending7d: Array<{ id: string; volumeUsd: number }>;
  topAllTime: Array<{ id: string; volumeUsd: number }>;
  newThisWeekIds: string[];
  limit: number;
}): Array<{ id: string; volumeUsd: number; source: HomeCollectionSource }> {
  const limit = Math.max(0, input.limit);
  const out: Array<{ id: string; volumeUsd: number; source: HomeCollectionSource }> =
    [];
  const seen = new Set<string>();

  for (const row of rankByVolumeDesc(input.trending7d)) {
    if (out.length >= limit) break;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push({ ...row, source: "trending_7d" });
  }

  for (const row of rankByVolumeDesc(input.topAllTime)) {
    if (out.length >= limit) break;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push({ ...row, source: "top_volume" });
  }

  for (const id of input.newThisWeekIds) {
    if (out.length >= limit) break;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, volumeUsd: 0, source: "new_this_week" });
  }

  return out;
}

export function collectionsSubtitleMode(
  sources: HomeCollectionSource[],
): HomeCollectionsSection["subtitleMode"] {
  if (sources.length === 0) return "trending";
  const uniq = new Set(sources);
  if (uniq.size === 1 && uniq.has("trending_7d")) return "trending";
  if (uniq.size === 1 && uniq.has("top_volume")) return "top_volume";
  if (uniq.size === 1 && uniq.has("new_this_week")) return "new";
  if (!uniq.has("trending_7d")) {
    return uniq.has("top_volume") ? "top_volume" : "new";
  }
  return "mixed";
}

export type ScoredHotWork = {
  listingId: string;
  score: number;
  activity: HotWorksActivity;
};

export function rankHotWorks(
  scored: ScoredHotWork[],
  limit: number,
): ScoredHotWork[] {
  return [...scored]
    .filter((s) => s.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.listingId.localeCompare(b.listingId),
    )
    .slice(0, Math.max(0, limit));
}

/**
 * Hot first, then most-viewed, then newest — without claiming filler is "hot".
 */
export function fillHotWorksDiscovery(input: {
  hotIds: string[];
  mostViewedIds: string[];
  newestIds: string[];
  limit: number;
}): Array<{ id: string; source: "hot" | "most_viewed" | "newest" }> {
  const limit = Math.max(0, input.limit);
  const out: Array<{ id: string; source: "hot" | "most_viewed" | "newest" }> =
    [];
  const seen = new Set<string>();

  for (const id of input.hotIds) {
    if (out.length >= limit) break;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, source: "hot" });
  }
  for (const id of input.mostViewedIds) {
    if (out.length >= limit) break;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, source: "most_viewed" });
  }
  for (const id of input.newestIds) {
    if (out.length >= limit) break;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, source: "newest" });
  }
  return out;
}

export function hotWorksSubtitleMode(
  sources: Array<"hot" | "most_viewed" | "newest">,
): HotWorksSection["subtitleMode"] {
  if (sources.length === 0) return "hot";
  const uniq = new Set(sources);
  if (uniq.size === 1 && uniq.has("hot")) return "hot";
  if (uniq.size === 1 && uniq.has("most_viewed")) return "most_viewed";
  if (uniq.size === 1 && uniq.has("newest")) return "newest";
  if (!uniq.has("hot")) {
    return uniq.has("most_viewed") ? "most_viewed" : "newest";
  }
  return "mixed";
}

function isLiveAuctionWindow(listing: Listing, now: number): boolean {
  if (listing.type !== "auction" || listing.delisted) return false;
  if (listing.auctionStartsAt == null || listing.auctionEndsAt == null) {
    return false;
  }
  if (now < listing.auctionStartsAt || now > listing.auctionEndsAt) {
    return false;
  }
  return (
    listing.stage === "soft_launch" ||
    listing.stage === "rising_eligible" ||
    listing.stage === "featured_eligible" ||
    listing.stage === "featured"
  );
}

/** Active English auctions, soonest ending first. */
export function selectEnglishAuctionsEndingSoon(
  listings: Iterable<Listing>,
  now = Date.now(),
  limit: number = HOME_SECTION_LIMITS.englishEndingSoon,
): Listing[] {
  return [...listings]
    .filter(
      (l) =>
        isLiveAuctionWindow(l, now) && resolveSaleMode(l) === "english",
    )
    .sort((a, b) => (a.auctionEndsAt ?? 0) - (b.auctionEndsAt ?? 0))
    .slice(0, Math.max(0, limit));
}

/** Live timed-window drops (not English). */
export function selectTimedWindowDropsLive(
  listings: Iterable<Listing>,
  now = Date.now(),
  limit: number = HOME_SECTION_LIMITS.timedDropsLive,
): Listing[] {
  return [...listings]
    .filter(
      (l) =>
        isLiveAuctionWindow(l, now) && resolveSaleMode(l) === "timed_window",
    )
    .sort((a, b) => (a.auctionEndsAt ?? 0) - (b.auctionEndsAt ?? 0))
    .slice(0, Math.max(0, limit));
}

export function deriveCollectionFloorUsd(listings: Listing[]): number | null {
  let floor: number | null = null;
  for (const listing of listings) {
    if (!isBuyableHomeListing(listing)) continue;
    const mode = resolveSaleMode(listing);
    let price: number | null = null;
    if (mode === "english") {
      const high = Number(listing.currentHighBidUsd ?? 0) || 0;
      const start =
        Number(listing.startingBidUsd ?? listing.priceUsd ?? 0) || 0;
      price = high > 0 ? high : start > 0 ? start : null;
    } else if (listing.priceUsd != null && Number.isFinite(listing.priceUsd)) {
      price = Number(listing.priceUsd);
    }
    if (price == null || !(price > 0)) continue;
    if (floor == null || price < floor) floor = price;
  }
  return floor;
}

function coverUrlForCollection(row: {
  heroListingId: string | null;
  listings: Listing[];
}): string | null {
  const hero =
    row.listings.find((l) => l.id === row.heroListingId) ?? row.listings[0];
  return hero?.mediaUrl ?? null;
}

function toCardFromBrowse(
  row: CollectionBrowseRow,
  source: HomeCollectionSource,
  volumeUsd: number,
  volumeLabel: "7d" | "all-time",
): HomeCollectionCardModel {
  return {
    id: row.id,
    title: row.title,
    creatorId: row.creatorId,
    creatorName: row.creatorName,
    chain: row.chain,
    totalItems: row.totalItems,
    volumeUsd,
    volumeLabel,
    floorUsd: deriveCollectionFloorUsd(row.listings),
    coverUrl: coverUrlForCollection(row),
    source,
  };
}

async function aggregateHotActivitySince(
  sinceMs: number,
): Promise<Map<string, HotWorksActivity>> {
  const map = new Map<string, HotWorksActivity>();
  const bump = (
    listingId: string,
    key: keyof HotWorksActivity,
    n = 1,
  ) => {
    const cur = map.get(listingId) ?? {
      views: 0,
      saves: 0,
      bids: 0,
      purchases: 0,
    };
    cur[key] += n;
    map.set(listingId, cur);
  };

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const {
    isMemoryMode,
    getMemoryPurchases,
    getMemoryEngine,
  } = await import("@/lib/data/memory-store");
  const { getMemoryBids } = await import("@/lib/marketplace/english-auction");
  const mode = await ensureDatabaseReady();

  if (mode === "memory" || isMemoryMode()) {
    const engine = getMemoryEngine();
    // Memory mode keeps counters, not timed signal rows — approximate with
    // all-time pageViews/saves so local/dev still surfaces a hot strip.
    for (const listing of engine.state.listings.values()) {
      if (!isBuyableHomeListing(listing)) continue;
      const views = listing.signals.pageViews ?? 0;
      const saves = listing.signals.saves ?? 0;
      if (views || saves) {
        bump(listing.id, "views", views);
        bump(listing.id, "saves", saves);
      }
    }
    for (const bid of getMemoryBids()) {
      if ((bid.createdAt ?? 0) < sinceMs) continue;
      bump(bid.listingId, "bids");
    }
    for (const purchase of getMemoryPurchases()) {
      if ((purchase.status ?? "completed") !== "completed") continue;
      if ((purchase.soldAt ?? 0) < sinceMs) continue;
      bump(purchase.listingId, "purchases");
    }
    return map;
  }

  const since = new Date(sinceMs);

  const signalRows = await prisma.$queryRaw<
    Array<{ listingId: string; views: bigint | number; saves: bigint | number }>
  >`
    SELECT "listingId" AS "listingId",
           SUM(CASE WHEN "type" IN ('page_view', 'meaningful_view') THEN 1 ELSE 0 END) AS "views",
           SUM(CASE WHEN "type" = 'save' THEN 1 ELSE 0 END) AS "saves"
    FROM "SignalEvent"
    WHERE "createdAt" >= ${since}
      AND "listingId" IS NOT NULL
      AND "type" IN ('page_view', 'meaningful_view', 'save')
    GROUP BY "listingId"
  `;
  for (const row of signalRows) {
    bump(row.listingId, "views", Number(row.views) || 0);
    bump(row.listingId, "saves", Number(row.saves) || 0);
  }

  const bidRows = await prisma.$queryRaw<
    Array<{ listingId: string; bids: bigint | number }>
  >`
    SELECT "listingId" AS "listingId", COUNT(*)::int AS "bids"
    FROM "Bid"
    WHERE "createdAt" >= ${since}
    GROUP BY "listingId"
  `;
  for (const row of bidRows) {
    bump(row.listingId, "bids", Number(row.bids) || 0);
  }

  const purchaseRows = await prisma.$queryRaw<
    Array<{ listingId: string; purchases: bigint | number }>
  >`
    SELECT "listingId" AS "listingId", COUNT(*)::int AS "purchases"
    FROM "Purchase"
    WHERE "status" = 'completed'
      AND "createdAt" >= ${since}
    GROUP BY "listingId"
  `;
  for (const row of purchaseRows) {
    bump(row.listingId, "purchases", Number(row.purchases) || 0);
  }

  return map;
}

export async function loadHomeDiscovery(
  now = Date.now(),
): Promise<HomeDiscoveryPayload> {
  const { getDiscoveryEngine } = await import("@/lib/marketplace/service");
  const engine = await getDiscoveryEngine();
  const allListings = [...engine.state.listings.values()];

  const since7d = now - HOME_TRENDING_COLLECTIONS_WINDOW_MS;
  const since72h = now - HOME_HOT_WORKS_WINDOW_MS;

  const [vol7d, volAll, newRows, activity] = await Promise.all([
    aggregateCollectionVolumesUsdSince(since7d),
    aggregateCollectionVolumesUsd(),
    listNewCollectionsThisWeek({ now }),
    aggregateHotActivitySince(since72h),
  ]);

  const browseById = new Map<string, CollectionBrowseRow>();
  for (const collection of engine.state.collections.values()) {
    const surface = engine.getCollectionSurface(collection.id);
    const creator = engine.state.creators.get(collection.creatorId);
    browseById.set(collection.id, {
      id: collection.id,
      title: collection.title,
      creatorId: collection.creatorId,
      creatorName: creator?.displayName ?? collection.creatorId,
      chain: collection.chain,
      totalItems: collection.totalItems,
      heroListingId: collection.heroListingId,
      listings: surface?.listings ?? [],
      volumeUsd: volAll.get(collection.id) ?? 0,
      createdAt: collection.createdAt ?? null,
    });
  }

  const trendingEntries = [...vol7d.entries()].map(([id, volumeUsd]) => ({
    id,
    volumeUsd,
  }));
  const topEntries = [...volAll.entries()].map(([id, volumeUsd]) => ({
    id,
    volumeUsd,
  }));
  const filledCollections = fillCollectionDiscovery({
    trending7d: trendingEntries,
    topAllTime: topEntries,
    newThisWeekIds: newRows.map((r) => r.id),
    limit: HOME_SECTION_LIMITS.trendingCollections,
  }).filter((row) => browseById.has(row.id));

  const collectionCards = filledCollections.map((row) => {
    const browse = browseById.get(row.id)!;
    const volumeLabel: "7d" | "all-time" =
      row.source === "trending_7d" ? "7d" : "all-time";
    const volumeUsd =
      row.source === "trending_7d"
        ? row.volumeUsd
        : volAll.get(row.id) ?? row.volumeUsd;
    return toCardFromBrowse(browse, row.source, volumeUsd, volumeLabel);
  });

  const buyable = allListings.filter(isBuyableHomeListing);
  const scored: ScoredHotWork[] = [];
  for (const listing of buyable) {
    const activityRow = activity.get(listing.id);
    if (!activityRow) continue;
    const score = scoreHotWork(activityRow, HOME_HOT_WORKS_WEIGHTS);
    if (score <= 0) continue;
    scored.push({ listingId: listing.id, score, activity: activityRow });
  }
  const hotRanked = rankHotWorks(scored, HOME_SECTION_LIMITS.hotWorks);
  const mostViewed = rankTrendingListings(buyable).map((l) => l.id);
  const newest = [...buyable]
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
    .map((l) => l.id);
  const hotFilled = fillHotWorksDiscovery({
    hotIds: hotRanked.map((h) => h.listingId),
    mostViewedIds: mostViewed,
    newestIds: newest,
    limit: HOME_SECTION_LIMITS.hotWorks,
  });
  const listingById = new Map(allListings.map((l) => [l.id, l]));
  const hotItems = hotFilled
    .map((row) => listingById.get(row.id))
    .filter((l): l is Listing => !!l);

  const newCollectionCards = newRows
    .slice(0, HOME_SECTION_LIMITS.newCollections)
    .map((row) =>
      toCardFromBrowse(
        row,
        "new_this_week",
        volAll.get(row.id) ?? row.volumeUsd,
        "all-time",
      ),
    );

  // Prefer explicit english / timed split; fall back to legacy strip for timed.
  const englishEndingSoon = selectEnglishAuctionsEndingSoon(
    allListings,
    now,
    HOME_SECTION_LIMITS.englishEndingSoon,
  );
  let timedDropsLive = selectTimedWindowDropsLive(
    allListings,
    now,
    HOME_SECTION_LIMITS.timedDropsLive,
  );
  if (timedDropsLive.length === 0 && englishEndingSoon.length === 0) {
    timedDropsLive = selectLiveAuctionStrip(allListings, now).filter(
      (l) => resolveSaleMode(l) !== "english",
    );
  }

  return {
    collections: {
      items: collectionCards,
      subtitleMode: collectionsSubtitleMode(
        filledCollections.map((c) => c.source),
      ),
      viewAllHref: "/collections",
    },
    hotWorks: {
      items: hotItems,
      subtitleMode: hotWorksSubtitleMode(hotFilled.map((h) => h.source)),
      viewAllHref: "/trending",
    },
    englishEndingSoon,
    timedDropsLive,
    newCollections: newCollectionCards,
  };
}

export async function getCachedHomeDiscovery(
  now = Date.now(),
): Promise<HomeDiscoveryPayload> {
  try {
    const { unstable_cache } = await import("next/cache");
    const cached = unstable_cache(
      async () => loadHomeDiscovery(Date.now()),
      ["home-discovery-v1"],
      { revalidate: 60 },
    );
    return cached();
  } catch {
    return loadHomeDiscovery(now);
  }
}
