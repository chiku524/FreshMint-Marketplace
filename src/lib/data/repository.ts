import { ensureDatabaseReady } from "@/lib/db-ready";
import { prisma } from "@/lib/db";
import type { MarketplaceState } from "@/lib/discovery";
import type { FollowGraph, Report, Appeal } from "@/lib/discovery/types";
import { getMemoryState, isMemoryMode } from "@/lib/data/memory-store";
import { toCollection, toCreatorProfile, toListing, toShelf } from "./mappers";

export async function loadMarketplaceState(): Promise<MarketplaceState> {
  // Guard for runtimes that don't execute instrumentation before first request.
  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    return getMemoryState();
  }

  try {
    return await loadMarketplaceStateFromPrisma();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[freshmint] prisma load failed, using memory catalog:", message);
    const { enableMemoryMode } = await import("@/lib/data/memory-store");
    enableMemoryMode(message);
    return getMemoryState();
  }
}

async function loadMarketplaceStateFromPrisma(): Promise<MarketplaceState> {
  const [users, listings, collections, shelves, follows, reports, appeals] =
    await Promise.all([
      prisma.user.findMany({ include: { wallets: true } }),
      prisma.listing.findMany(),
      prisma.collection.findMany(),
      prisma.shelf.findMany({
        include: { items: true, followers: true },
      }),
      prisma.follow.findMany(),
      prisma.report.findMany(),
      prisma.appeal.findMany(),
    ]);

  const creators = new Map(
    users.map((u) => [u.id, toCreatorProfile(u)] as const),
  );
  const listingMap = new Map(
    listings.map((l) => [l.id, toListing(l)] as const),
  );
  const collectionMap = new Map(
    collections.map((c) => [c.id, toCollection(c)] as const),
  );
  const shelfMap = new Map(shelves.map((s) => [s.id, toShelf(s)] as const));

  const followMap = new Map<string, FollowGraph>();
  for (const f of follows) {
    const existing = followMap.get(f.followerId) ?? {
      collectorId: f.followerId,
      followedArtistIds: [],
      followedCollectorIds: [],
      followedShelfIds: [],
    };
    if (f.kind === "artist") existing.followedArtistIds.push(f.followeeId);
    else existing.followedCollectorIds.push(f.followeeId);
    followMap.set(f.followerId, existing);
  }
  for (const shelf of shelves) {
    for (const follower of shelf.followers) {
      const existing = followMap.get(follower.followerId) ?? {
        collectorId: follower.followerId,
        followedArtistIds: [],
        followedCollectorIds: [],
        followedShelfIds: [],
      };
      existing.followedShelfIds.push(shelf.id);
      followMap.set(follower.followerId, existing);
    }
  }

  const reportModels: Report[] = reports.map((r) => ({
    id: r.id,
    listingId: r.listingId,
    reporterId: r.reporterId,
    reason: r.reason as Report["reason"],
    createdAt: r.createdAt.getTime(),
    resolved: r.resolved,
  }));

  const appealModels: Appeal[] = appeals.map((a) => ({
    id: a.id,
    listingId: a.listingId,
    creatorId: a.creatorId,
    message: a.message,
    createdAt: a.createdAt.getTime(),
    status: a.status as Appeal["status"],
  }));

  return {
    creators,
    listings: listingMap,
    collections: collectionMap,
    shelves: shelfMap,
    follows: followMap,
    reports: reportModels,
    appeals: appealModels,
  };
}

export async function persistListingSignals(listingId: string, signals: {
  saves?: number;
  follows?: number;
  dwellMsTotal?: number;
  uniqueViewers?: number;
  impressionsToday?: number;
  impressionsThisWeek?: number;
  reportRate?: number;
  nominationScore?: number;
  delisted?: boolean;
  appealStatus?: string;
  stage?: string;
  softLaunchedAt?: Date | null;
  risingEligibleAt?: Date | null;
  featuredAt?: Date | null;
}) {
  await ensureDatabaseReady();
  await prisma.listing.update({
    where: { id: listingId },
    data: signals,
  });
}

export async function persistCreatorStats(
  creatorId: string,
  data: {
    risingEntriesThisWeek?: number;
    openLaneListingsToday?: number;
    curatorScore?: number;
    completedSales?: number;
    lifetimePrimaryVolumeUsd?: number;
    firstListingAt?: Date | null;
  },
) {
  await ensureDatabaseReady();
  await prisma.user.update({ where: { id: creatorId }, data });
}
