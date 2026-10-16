/**
 * Bulk draft-listing creation for large collections (up to 10,000 items).
 *
 * The per-item POST /api/listings path costs, per item: a full engine load
 * (7 table scans, cached for 10s), a collection read + update, a user read and
 * one insert. This path costs a fixed ~7 queries per chunk of up to 500 items:
 *   ownership read, existing-hash lookup, cross-creator dupe lookup, count,
 *   createManyAndReturn, one collection update, one user update.
 *
 * Idempotent / resumable: the natural key is (collectionId, mediaHash). Items
 * whose media already exists in this collection come back as `existing` with
 * their id, so a client can resend any chunk after a timeout or reload.
 */
import { prisma } from "@/lib/db";
import { resolveNetwork, vmFromNetwork } from "@/lib/chains/registry";
import type { ListingType, NetworkId } from "@/lib/discovery/types";
import { parseTraits } from "@/lib/marketplace/drops";

export const COLLECTION_ITEM_CAP = 10_000;
export const BULK_CHUNK_MAX = 500;

export type BulkItem = {
  title: string;
  description?: string;
  mediaHash: string;
  mediaUrl?: string | null;
  traits?: { trait_type: string; value: string }[];
  maxSupply?: number | null;
  isCollectionHero?: boolean;
};

export type BulkShared = {
  type: ListingType;
  network: NetworkId | string;
  priceUsd?: number | null;
  medium: string;
  styleTags: string[];
  oeStartsAt?: string | null;
  oeEndsAt?: string | null;
  auctionStartsAt?: string | null;
  auctionEndsAt?: string | null;
  saleMode?: string | null;
  startingBidUsd?: number | null;
  reserveUsd?: number | null;
};

export type BulkItemResult =
  | { mediaHash: string; status: "created" | "existing"; listingId: string }
  | { mediaHash: string; status: "error"; error: string };

export type BulkResult =
  | { ok: true; results: BulkItemResult[]; totalItems: number }
  | { ok: false; error: string; status: number };

/** Pure planning step (unit-tested): dedupe within the request and classify. */
export function planBulkInsert(input: {
  items: BulkItem[];
  existingInCollection: Map<string, string>;
  foreignHashes: Map<string, string>;
  currentCount: number;
  cap?: number;
}): { toCreate: BulkItem[]; results: Map<string, BulkItemResult>; overCap: boolean } {
  const cap = input.cap ?? COLLECTION_ITEM_CAP;
  const results = new Map<string, BulkItemResult>();
  const toCreate: BulkItem[] = [];
  for (const item of input.items) {
    const h = item.mediaHash;
    if (results.has(h) || toCreate.some((i) => i.mediaHash === h)) continue;
    const existingId = input.existingInCollection.get(h);
    if (existingId) {
      results.set(h, { mediaHash: h, status: "existing", listingId: existingId });
      continue;
    }
    const foreign = input.foreignHashes.get(h);
    if (foreign) {
      results.set(h, { mediaHash: h, status: "error", error: `duplicate_media:${foreign}` });
      continue;
    }
    toCreate.push(item);
  }
  return { toCreate, results, overCap: input.currentCount + toCreate.length > cap };
}

export async function bulkCreateCollectionListings(input: {
  creatorId: string;
  collectionId: string;
  shared: BulkShared;
  items: BulkItem[];
}): Promise<BulkResult> {
  if (input.items.length === 0) return { ok: true, results: [], totalItems: 0 };
  if (input.items.length > BULK_CHUNK_MAX) {
    return { ok: false, error: "chunk_too_large", status: 400 };
  }

  const collection = await prisma.collection.findUnique({
    where: { id: input.collectionId },
    select: { id: true, creatorId: true, heroListingId: true, sampleIdsJson: true },
  });
  if (!collection) return { ok: false, error: "collection_not_found", status: 404 };
  if (collection.creatorId !== input.creatorId) {
    return { ok: false, error: "collection_forbidden", status: 403 };
  }

  if (input.shared.type === "open_edition" || input.shared.type === "auction") {
    const { validateDropWindow } = await import("@/lib/marketplace/calendar");
    const startIso =
      input.shared.type === "open_edition" ? input.shared.oeStartsAt : input.shared.auctionStartsAt;
    const endIso =
      input.shared.type === "open_edition" ? input.shared.oeEndsAt : input.shared.auctionEndsAt;
    const cal = await validateDropWindow({
      type: input.shared.type,
      startsAt: startIso ? new Date(startIso).getTime() : null,
      endsAt: endIso ? new Date(endIso).getTime() : null,
      excludeCollectionId: input.collectionId,
    });
    if (!cal.ok) return { ok: false, error: cal.errors.join(","), status: 400 };
  }

  const hashes = [...new Set(input.items.map((i) => i.mediaHash))];
  const [existingRows, foreignRows, currentCount] = await Promise.all([
    prisma.listing.findMany({
      where: { collectionId: input.collectionId, mediaHash: { in: hashes } },
      select: { id: true, mediaHash: true },
    }),
    prisma.listing.findMany({
      where: {
        mediaHash: { in: hashes },
        delisted: false,
        creatorId: { not: input.creatorId },
      },
      select: { id: true, mediaHash: true },
    }),
    prisma.listing.count({ where: { collectionId: input.collectionId } }),
  ]);

  const plan = planBulkInsert({
    items: input.items,
    existingInCollection: new Map(existingRows.map((r) => [r.mediaHash, r.id])),
    foreignHashes: new Map(foreignRows.map((r) => [r.mediaHash, r.id])),
    currentCount,
  });
  if (plan.overCap) {
    return { ok: false, error: "collection_item_cap", status: 400 };
  }

  const network = resolveNetwork(input.shared.network);
  const chain = vmFromNetwork(network);
  const s = input.shared;
  const created = plan.toCreate.length
    ? await prisma.listing.createManyAndReturn({
        data: plan.toCreate.map((item) => ({
          title: item.title,
          description: item.description ?? "",
          creatorId: input.creatorId,
          type: s.type,
          chain,
          network,
          stage: "draft",
          priceUsd: s.priceUsd ?? null,
          medium: s.medium,
          styleTagsJson: JSON.stringify(s.styleTags),
          mediaHash: item.mediaHash,
          mediaUrl: item.mediaUrl ?? null,
          metadataComplete: true,
          originalMedia: true,
          oeStartsAt: s.oeStartsAt ? new Date(s.oeStartsAt) : null,
          oeEndsAt: s.oeEndsAt ? new Date(s.oeEndsAt) : null,
          auctionStartsAt: s.auctionStartsAt ? new Date(s.auctionStartsAt) : null,
          auctionEndsAt: s.auctionEndsAt ? new Date(s.auctionEndsAt) : null,
          saleMode: s.saleMode ?? (s.type === "auction" ? "timed_window" : "fixed"),
          startingBidUsd: s.startingBidUsd ?? null,
          reserveUsd: s.reserveUsd ?? null,
          collectionId: input.collectionId,
          isCollectionHero: Boolean(item.isCollectionHero),
          traitsJson: JSON.stringify(parseTraits(item.traits ?? [])),
          maxSupply: item.maxSupply != null && item.maxSupply > 0 ? item.maxSupply : null,
        })),
        select: { id: true, mediaHash: true, isCollectionHero: true },
      })
    : [];

  for (const row of created) {
    plan.results.set(row.mediaHash, {
      mediaHash: row.mediaHash,
      status: "created",
      listingId: row.id,
    });
  }

  if (created.length) {
    // One membership update for the whole chunk (was one per item).
    const samples = JSON.parse(collection.sampleIdsJson || "[]") as string[];
    for (const row of created) {
      if (samples.length >= 12) break;
      if (!samples.includes(row.id)) samples.push(row.id);
    }
    const hero = created.find((r) => r.isCollectionHero)?.id;
    await prisma.collection.update({
      where: { id: input.collectionId },
      data: {
        totalItems: { increment: created.length },
        heroListingId: hero ?? collection.heroListingId ?? created[0].id,
        sampleIdsJson: JSON.stringify(samples.slice(0, 12)),
      },
    });
    await prisma.user.updateMany({
      where: { id: input.creatorId, firstListingAt: null },
      data: { firstListingAt: new Date() },
    });
    const g = globalThis as unknown as { __fmEngineCache?: { invalidate(): void } };
    g.__fmEngineCache?.invalidate();
  }

  const results = input.items.map(
    (i) =>
      plan.results.get(i.mediaHash) ?? {
        mediaHash: i.mediaHash,
        status: "error" as const,
        error: "not_created",
      },
  );
  return { ok: true, results, totalItems: currentCount + created.length };
}