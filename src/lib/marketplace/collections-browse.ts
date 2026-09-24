/**
 * Public collections browse gates (index vs new-this-week).
 */
import { prisma } from "@/lib/db";
import type { Collection, Listing } from "@/lib/discovery/types";
import {
  COLLECTION_INDEX_MIN_VOLUME_USD,
  COLLECTION_NEW_WINDOW_MS,
  collectionHasPublishedListing,
  collectionMeetsVolumeGate,
  isCollectionInNewWindow,
} from "@/lib/marketplace/collections-browse-config";

export {
  COLLECTION_INDEX_MIN_VOLUME_USD,
  COLLECTION_NEW_WINDOW_MS,
  collectionHasPublishedListing,
  collectionMeetsVolumeGate,
  isCollectionInNewWindow,
  sumCompletedPurchaseVolume,
} from "@/lib/marketplace/collections-browse-config";

/**
 * Aggregate completed primary volume per collectionId.
 * Counts completed Purchase rows on listings in the collection (package legs included).
 */
export async function aggregateCollectionVolumesUsd(): Promise<Map<string, number>> {
  const volumes = new Map<string, number>();
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryPurchases, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();

  if (mode === "memory" || isMemoryMode()) {
    const engine = getMemoryEngine();
    const listingToCollection = new Map<string, string>();
    for (const listing of engine.state.listings.values()) {
      if (listing.collectionId) {
        listingToCollection.set(listing.id, listing.collectionId);
      }
    }
    for (const purchase of getMemoryPurchases()) {
      if ((purchase.status ?? "completed") !== "completed") continue;
      const collectionId = listingToCollection.get(purchase.listingId);
      if (!collectionId) continue;
      const prev = volumes.get(collectionId) ?? 0;
      volumes.set(
        collectionId,
        Math.round((prev + Number(purchase.amountUsd || 0)) * 100) / 100,
      );
    }
    return volumes;
  }

  const rows = await prisma.$queryRaw<
    Array<{ collectionId: string; volumeUsd: number | bigint | string }>
  >`
    SELECT l."collectionId" AS "collectionId",
           COALESCE(SUM(p."amountUsd"), 0) AS "volumeUsd"
    FROM "Purchase" p
    INNER JOIN "Listing" l ON l."id" = p."listingId"
    WHERE p."status" = 'completed'
      AND l."collectionId" IS NOT NULL
    GROUP BY l."collectionId"
  `;

  for (const row of rows) {
    const volume = Number(row.volumeUsd);
    volumes.set(
      row.collectionId,
      Math.round((Number.isFinite(volume) ? volume : 0) * 100) / 100,
    );
  }
  return volumes;
}

export type CollectionBrowseRow = {
  id: string;
  title: string;
  creatorId: string;
  creatorName: string;
  chain: string;
  totalItems: number;
  heroListingId: string | null;
  listings: Listing[];
  volumeUsd: number;
  createdAt: number | null;
};

export async function listTopCollectionsForIndex(input?: {
  minVolumeUsd?: number;
}): Promise<CollectionBrowseRow[]> {
  const min = input?.minVolumeUsd ?? COLLECTION_INDEX_MIN_VOLUME_USD;
  const volumes = await aggregateCollectionVolumesUsd();
  const { getDiscoveryEngine } = await import("@/lib/marketplace/service");
  const engine = await getDiscoveryEngine();

  const rows: CollectionBrowseRow[] = [];
  for (const collection of engine.state.collections.values()) {
    const volumeUsd = volumes.get(collection.id) ?? 0;
    if (!collectionMeetsVolumeGate(volumeUsd, min)) continue;
    const surface = engine.getCollectionSurface(collection.id);
    const creator = engine.state.creators.get(collection.creatorId);
    rows.push({
      id: collection.id,
      title: collection.title,
      creatorId: collection.creatorId,
      creatorName: creator?.displayName ?? collection.creatorId,
      chain: collection.chain,
      totalItems: collection.totalItems,
      heroListingId: collection.heroListingId,
      listings: surface?.listings ?? [],
      volumeUsd,
      createdAt: collection.createdAt ?? null,
    });
  }
  rows.sort((a, b) => b.volumeUsd - a.volumeUsd || a.title.localeCompare(b.title));
  return rows;
}

export async function listNewCollectionsThisWeek(input?: {
  now?: number;
  windowMs?: number;
}): Promise<CollectionBrowseRow[]> {
  const now = input?.now ?? Date.now();
  const windowMs = input?.windowMs ?? COLLECTION_NEW_WINDOW_MS;
  const volumes = await aggregateCollectionVolumesUsd();
  const { getDiscoveryEngine } = await import("@/lib/marketplace/service");
  const engine = await getDiscoveryEngine();

  const rows: CollectionBrowseRow[] = [];
  for (const collection of engine.state.collections.values()) {
    const createdAt = collection.createdAt ?? null;
    if (!isCollectionInNewWindow(createdAt, now, windowMs)) continue;
    const surfaceListings = [
      ...engine.state.listings.values(),
    ].filter((l) => l.collectionId === collection.id);
    if (!collectionHasPublishedListing(surfaceListings)) continue;
    const surface = engine.getCollectionSurface(collection.id);
    const creator = engine.state.creators.get(collection.creatorId);
    rows.push({
      id: collection.id,
      title: collection.title,
      creatorId: collection.creatorId,
      creatorName: creator?.displayName ?? collection.creatorId,
      chain: collection.chain,
      totalItems: collection.totalItems,
      heroListingId: collection.heroListingId,
      listings: surface?.listings ?? [],
      volumeUsd: volumes.get(collection.id) ?? 0,
      createdAt,
    });
  }
  rows.sort(
    (a, b) =>
      (b.createdAt ?? 0) - (a.createdAt ?? 0) || a.title.localeCompare(b.title),
  );
  return rows;
}

/** Public API browse list: only volume-gated collections (not creator mine=1). */
export function filterPublicCollectionApiList(
  collections: Collection[],
  volumes: Map<string, number>,
  minUsd: number = COLLECTION_INDEX_MIN_VOLUME_USD,
): Collection[] {
  return collections.filter((c) =>
    collectionMeetsVolumeGate(volumes.get(c.id) ?? 0, minUsd),
  );
}
