/**
 * Creators discovery: 7d / all-time volume aggregates + ranking helpers.
 */
import { prisma } from "@/lib/db";
import type { CreatorProfile } from "@/lib/discovery/types";
import {
  CREATOR_HOME_LIMIT,
  CREATOR_NEW_WINDOW_MS,
  creatorHasPublishedWorks,
  creatorMeetsTopVolumeGate,
  isCreatorInNewWindow,
  type CreatorsSortId,
} from "@/lib/marketplace/creators-browse-config";

export type CreatorBrowseSource = "trending_7d" | "most_active" | "newest";

export type CreatorBrowseRow = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  volumeUsd7d: number;
  volumeUsdAllTime: number;
  publishedWorks: number;
  collectionCount: number;
  completedSales: number;
  firstListingAt: number | null;
  emerging: boolean;
  verifiedCreator: boolean;
  establishedBadge: boolean;
  source?: CreatorBrowseSource;
};

export type CreatorsHomeSection = {
  items: CreatorBrowseRow[];
  subtitleMode: "trending" | "most_active" | "newest" | "mixed";
  viewAllHref: string;
};

export async function aggregateCreatorVolumesUsdSince(
  sinceMs: number,
): Promise<Map<string, number>> {
  const volumes = new Map<string, number>();
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryPurchases, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();

  if (mode === "memory" || isMemoryMode()) {
    const engine = getMemoryEngine();
    for (const purchase of getMemoryPurchases()) {
      if ((purchase.status ?? "completed") !== "completed") continue;
      if ((purchase.soldAt ?? 0) < sinceMs) continue;
      const listing = engine.state.listings.get(purchase.listingId);
      if (!listing) continue;
      const prev = volumes.get(listing.creatorId) ?? 0;
      volumes.set(
        listing.creatorId,
        Math.round((prev + Number(purchase.amountUsd || 0)) * 100) / 100,
      );
    }
    return volumes;
  }

  const since = new Date(sinceMs);
  const rows = await prisma.$queryRaw<
    Array<{ creatorId: string; volumeUsd: number | bigint | string }>
  >`
    SELECT l."creatorId" AS "creatorId",
           COALESCE(SUM(p."amountUsd"), 0) AS "volumeUsd"
    FROM "Purchase" p
    INNER JOIN "Listing" l ON l."id" = p."listingId"
    WHERE p."status" = 'completed'
      AND p."createdAt" >= ${since}
    GROUP BY l."creatorId"
  `;

  for (const row of rows) {
    const volume = Number(row.volumeUsd);
    volumes.set(
      row.creatorId,
      Math.round((Number.isFinite(volume) ? volume : 0) * 100) / 100,
    );
  }
  return volumes;
}

export async function aggregateCreatorVolumesUsd(): Promise<Map<string, number>> {
  const volumes = new Map<string, number>();
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryPurchases, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();

  if (mode === "memory" || isMemoryMode()) {
    const engine = getMemoryEngine();
    for (const purchase of getMemoryPurchases()) {
      if ((purchase.status ?? "completed") !== "completed") continue;
      const listing = engine.state.listings.get(purchase.listingId);
      if (!listing) continue;
      const prev = volumes.get(listing.creatorId) ?? 0;
      volumes.set(
        listing.creatorId,
        Math.round((prev + Number(purchase.amountUsd || 0)) * 100) / 100,
      );
    }
    return volumes;
  }

  const rows = await prisma.$queryRaw<
    Array<{ creatorId: string; volumeUsd: number | bigint | string }>
  >`
    SELECT l."creatorId" AS "creatorId",
           COALESCE(SUM(p."amountUsd"), 0) AS "volumeUsd"
    FROM "Purchase" p
    INNER JOIN "Listing" l ON l."id" = p."listingId"
    WHERE p."status" = 'completed'
    GROUP BY l."creatorId"
  `;

  for (const row of rows) {
    const volume = Number(row.volumeUsd);
    volumes.set(
      row.creatorId,
      Math.round((Number.isFinite(volume) ? volume : 0) * 100) / 100,
    );
  }
  return volumes;
}

/**
 * Fill trending creators: 7d volume leaders, then most-active, then newest.
 * Never relabels filler as trending.
 */
export function fillCreatorDiscovery(input: {
  trending7d: Array<{ id: string; volumeUsd: number }>;
  mostActiveIds: string[];
  newestIds: string[];
  limit: number;
}): Array<{ id: string; volumeUsd: number; source: CreatorBrowseSource }> {
  const limit = Math.max(0, input.limit);
  const out: Array<{ id: string; volumeUsd: number; source: CreatorBrowseSource }> =
    [];
  const seen = new Set<string>();

  const trending = [...input.trending7d]
    .filter((e) => creatorMeetsTopVolumeGate(e.volumeUsd))
    .sort((a, b) => b.volumeUsd - a.volumeUsd || a.id.localeCompare(b.id));

  for (const row of trending) {
    if (out.length >= limit) break;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push({ ...row, source: "trending_7d" });
  }
  for (const id of input.mostActiveIds) {
    if (out.length >= limit) break;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, volumeUsd: 0, source: "most_active" });
  }
  for (const id of input.newestIds) {
    if (out.length >= limit) break;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, volumeUsd: 0, source: "newest" });
  }
  return out;
}

export function creatorsSubtitleMode(
  sources: CreatorBrowseSource[],
): CreatorsHomeSection["subtitleMode"] {
  if (sources.length === 0) return "trending";
  const uniq = new Set(sources);
  if (uniq.size === 1 && uniq.has("trending_7d")) return "trending";
  if (uniq.size === 1 && uniq.has("most_active")) return "most_active";
  if (uniq.size === 1 && uniq.has("newest")) return "newest";
  if (!uniq.has("trending_7d")) {
    return uniq.has("most_active") ? "most_active" : "newest";
  }
  return "mixed";
}

function countPublished(listings: Array<{ creatorId: string; delisted?: boolean; stage?: string | null }>, creatorId: string): number {
  return listings.filter(
    (l) =>
      l.creatorId === creatorId && !l.delisted && l.stage !== "draft",
  ).length;
}

function countCollections(
  collections: Array<{ creatorId: string }>,
  creatorId: string,
): number {
  return collections.filter((c) => c.creatorId === creatorId).length;
}

export async function buildCreatorBrowseRows(input?: {
  now?: number;
}): Promise<CreatorBrowseRow[]> {
  const now = input?.now ?? Date.now();
  const since7d = now - CREATOR_NEW_WINDOW_MS;
  const { getDiscoveryEngine } = await import("@/lib/marketplace/service");
  const { isEmergingCreator } = await import("@/lib/discovery");
  const engine = await getDiscoveryEngine();
  const [vol7d, volAll] = await Promise.all([
    aggregateCreatorVolumesUsdSince(since7d),
    aggregateCreatorVolumesUsd(),
  ]);

  const listings = [...engine.state.listings.values()];
  const collections = [...engine.state.collections.values()];
  const rows: CreatorBrowseRow[] = [];

  for (const creator of engine.state.creators.values()) {
    const publishedWorks = countPublished(listings, creator.id);
    if (!creatorHasPublishedWorks(publishedWorks)) continue;
    const fromPurchases = volAll.get(creator.id);
    const volumeUsdAllTime =
      fromPurchases != null
        ? fromPurchases
        : Number(creator.lifetimePrimaryVolumeUsd || 0) || 0;
    rows.push({
      id: creator.id,
      displayName: creator.displayName,
      avatarUrl: creator.avatarUrl ?? null,
      volumeUsd7d: vol7d.get(creator.id) ?? 0,
      volumeUsdAllTime,
      publishedWorks,
      collectionCount: countCollections(collections, creator.id),
      completedSales: creator.completedSales,
      firstListingAt: creator.firstListingAt,
      emerging: isEmergingCreator(creator, now).emerging,
      verifiedCreator: creator.verifiedCreator,
      establishedBadge: creator.establishedBadge,
    });
  }
  return rows;
}

export function sortCreatorBrowseRows(
  rows: CreatorBrowseRow[],
  sort: CreatorsSortId,
  now = Date.now(),
): CreatorBrowseRow[] {
  const copy = [...rows];
  if (sort === "top") {
    return copy
      .filter((r) => creatorMeetsTopVolumeGate(r.volumeUsd7d))
      .sort(
        (a, b) =>
          b.volumeUsd7d - a.volumeUsd7d ||
          b.volumeUsdAllTime - a.volumeUsdAllTime ||
          a.displayName.localeCompare(b.displayName),
      );
  }
  if (sort === "new") {
    return copy
      .filter((r) => isCreatorInNewWindow(r.firstListingAt, now))
      .sort(
        (a, b) =>
          (b.firstListingAt ?? 0) - (a.firstListingAt ?? 0) ||
          a.displayName.localeCompare(b.displayName),
      );
  }
  // all_time
  return copy
    .filter((r) => r.volumeUsdAllTime > 0 || r.completedSales > 0)
    .sort(
      (a, b) =>
        b.volumeUsdAllTime - a.volumeUsdAllTime ||
        b.completedSales - a.completedSales ||
        a.displayName.localeCompare(b.displayName),
    );
}

export async function loadCreatorsHomeSection(
  now = Date.now(),
): Promise<CreatorsHomeSection> {
  const rows = await buildCreatorBrowseRows({ now });
  const byId = new Map(rows.map((r) => [r.id, r]));

  const trending7d = rows
    .filter((r) => creatorMeetsTopVolumeGate(r.volumeUsd7d))
    .map((r) => ({ id: r.id, volumeUsd: r.volumeUsd7d }));

  const mostActiveIds = [...rows]
    .sort(
      (a, b) =>
        b.publishedWorks - a.publishedWorks ||
        b.volumeUsdAllTime - a.volumeUsdAllTime ||
        a.id.localeCompare(b.id),
    )
    .map((r) => r.id);

  const newestIds = [...rows]
    .sort(
      (a, b) =>
        (b.firstListingAt ?? 0) - (a.firstListingAt ?? 0) ||
        a.id.localeCompare(b.id),
    )
    .map((r) => r.id);

  const filled = fillCreatorDiscovery({
    trending7d,
    mostActiveIds,
    newestIds,
    limit: CREATOR_HOME_LIMIT,
  }).filter((f) => byId.has(f.id));

  const items = filled.map((f) => ({
    ...byId.get(f.id)!,
    source: f.source,
  }));

  return {
    items,
    subtitleMode: creatorsSubtitleMode(filled.map((f) => f.source)),
    viewAllHref: "/creators",
  };
}

export async function getCachedCreatorsHomeSection(
  now = Date.now(),
): Promise<CreatorsHomeSection> {
  try {
    const { unstable_cache } = await import("next/cache");
    const cached = unstable_cache(
      async () => loadCreatorsHomeSection(Date.now()),
      ["creators-home-v1"],
      { revalidate: 60 },
    );
    return cached();
  } catch {
    return loadCreatorsHomeSection(now);
  }
}

export async function getCachedCreatorBrowseRows(): Promise<CreatorBrowseRow[]> {
  try {
    const { unstable_cache } = await import("next/cache");
    const cached = unstable_cache(
      async () => buildCreatorBrowseRows(),
      ["creators-browse-v1"],
      { revalidate: 60 },
    );
    return cached();
  } catch {
    return buildCreatorBrowseRows();
  }
}

/** Exported for tests that need a CreatorProfile-shaped stub. */
export type { CreatorProfile };
