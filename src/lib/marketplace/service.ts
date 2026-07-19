import "@/lib/env";
import { prisma } from "@/lib/db";
import { DiscoveryEngine } from "@/lib/discovery";
import { loadMarketplaceState, persistCreatorStats, persistListingSignals } from "@/lib/data/repository";
import { toListing } from "@/lib/data/mappers";
import type { Chain, LaunchStage, ListingType, ReportReason } from "@/lib/discovery/types";
import { isEmergingListing } from "@/lib/discovery";
import { settleNominationOutcome } from "@/lib/discovery/anti-spam";
import { validateDropWindow } from "@/lib/marketplace/calendar";
import {
  checkSignalSybil,
  detectWashRisk,
  maybeFlagWashCluster,
} from "@/lib/integrity/sybil";
import {
  buildEvmMintIntent,
  buildEvmPurchaseIntent,
  sendEvmMintWithServerKey,
  sendEvmBuyWithServerKey,
} from "@/lib/onchain/evm";
import {
  buildSolanaMintIntent,
  buildSolanaPurchaseIntent,
  sendSolanaMemoWithServerKey,
} from "@/lib/onchain/solana";
import { hashTextMedia } from "@/lib/media/upload";
import { parseEther } from "viem";

export async function getDiscoveryEngine(): Promise<DiscoveryEngine> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const mode = await ensureDatabaseReady();
  if (mode === "memory") {
    const { getMemoryEngine } = await import("@/lib/data/memory-store");
    return getMemoryEngine();
  }

  try {
    const state = await loadMarketplaceState();
    return new DiscoveryEngine(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { enableMemoryMode, getMemoryEngine } = await import(
      "@/lib/data/memory-store"
    );
    enableMemoryMode(message);
    return getMemoryEngine();
  }
}

export function hashMedia(content: string): string {
  return hashTextMedia(content);
}

export async function createListingForUser(input: {
  creatorId: string;
  title: string;
  description: string;
  type: ListingType;
  chain: Chain;
  priceUsd?: number | null;
  medium: string;
  styleTags: string[];
  /** Fallback text stand-in when no uploaded file hash is provided. */
  mediaContent?: string;
  mediaHash?: string;
  mediaUrl?: string;
  metadataComplete?: boolean;
  originalMedia?: boolean;
  oeStartsAt?: string | null;
  oeEndsAt?: string | null;
  auctionStartsAt?: string | null;
  auctionEndsAt?: string | null;
  publishSoftLaunch?: boolean;
}) {
  const engine = await getDiscoveryEngine();
  const mediaHash =
    input.mediaHash ??
    (input.mediaContent ? hashMedia(input.mediaContent) : "");
  if (!mediaHash) {
    return { ok: false as const, errors: ["media_required"] };
  }
  const mediaUrl =
    input.mediaUrl ??
    (input.mediaContent
      ? `data:text/plain;base64,${Buffer.from(input.mediaContent).toString("base64").slice(0, 200)}`
      : null);
  const now = Date.now();

  if (input.type === "open_edition" || input.type === "auction") {
    const startsAt =
      input.type === "open_edition"
        ? input.oeStartsAt
          ? new Date(input.oeStartsAt).getTime()
          : null
        : input.auctionStartsAt
          ? new Date(input.auctionStartsAt).getTime()
          : null;
    const endsAt =
      input.type === "open_edition"
        ? input.oeEndsAt
          ? new Date(input.oeEndsAt).getTime()
          : null
        : input.auctionEndsAt
          ? new Date(input.auctionEndsAt).getTime()
          : null;
    const cal = await validateDropWindow({ type: input.type, startsAt, endsAt });
    if (!cal.ok) {
      return { ok: false as const, errors: cal.errors };
    }
  }

  const draft = {
    id: `tmp-${now}`,
    title: input.title,
    description: input.description,
    creatorId: input.creatorId,
    type: input.type,
    chain: input.chain,
    stage: "draft" as const,
    priceUsd: input.priceUsd ?? null,
    medium: input.medium,
    styleTags: input.styleTags,
    mediaHash,
    mediaUrl,
    metadataComplete: input.metadataComplete ?? true,
    originalMedia: input.originalMedia ?? true,
    createdAt: now,
    softLaunchedAt: null,
    risingEligibleAt: null,
    featuredAt: null,
    oeStartsAt: input.oeStartsAt ? new Date(input.oeStartsAt).getTime() : null,
    oeEndsAt: input.oeEndsAt ? new Date(input.oeEndsAt).getTime() : null,
    auctionStartsAt: input.auctionStartsAt
      ? new Date(input.auctionStartsAt).getTime()
      : null,
    auctionEndsAt: input.auctionEndsAt
      ? new Date(input.auctionEndsAt).getTime()
      : null,
    collectionId: null,
    isCollectionHero: false,
    signals: {
      saves: 0,
      follows: 0,
      dwellMsTotal: 0,
      uniqueViewers: 0,
      impressionsToday: 0,
      impressionsThisWeek: 0,
      reportRate: 0,
      nominationScore: 0,
    },
    delisted: false,
    appealStatus: "none" as const,
  };

  // Validate against current inventory duplicates / quality.
  const validation = engine.createListing(draft);
  if (!validation.ok) {
    return { ok: false as const, errors: validation.errors };
  }

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();

  // Preview / serverless memory path — keep working without Prisma writes.
  if (mode === "memory" || isMemoryMode()) {
    const mem = getMemoryEngine();
    const id = `listing-mem-${now}`;
    if (!mem.state.creators.has(input.creatorId)) {
      mem.state.creators.set(input.creatorId, {
        id: input.creatorId,
        displayName: "Guest Creator",
        wallets: [{ chain: input.chain, address: `mem-${input.creatorId}` }],
        firstListingAt: now,
        lifetimePrimaryVolumeUsd: 0,
        completedSales: 0,
        flagged: false,
        washCluster: false,
        verifiedCreator: false,
        walletCreatedAt: now - 30 * 24 * 60 * 60 * 1000,
        risingEntriesThisWeek: 0,
        openLaneListingsToday: 0,
        curatorScore: 25,
        establishedBadge: false,
      });
    }
    mem.state.listings.delete(draft.id);
    const listing = {
      ...draft,
      id,
    };
    mem.state.listings.set(id, listing);
    if (input.publishSoftLaunch) {
      const advanced = mem.transitionListing(id, "soft_launch");
      if (advanced.ok && advanced.listing) {
        return { ok: true as const, listing: advanced.listing, errors: [] as string[] };
      }
    }
    return { ok: true as const, listing, errors: [] as string[] };
  }

  const created = await prisma.listing.create({
    data: {
      title: input.title,
      description: input.description,
      creatorId: input.creatorId,
      type: input.type,
      chain: input.chain,
      stage: "draft",
      priceUsd: input.priceUsd ?? null,
      medium: input.medium,
      styleTagsJson: JSON.stringify(input.styleTags),
      mediaHash,
      mediaUrl,
      metadataComplete: input.metadataComplete ?? true,
      originalMedia: input.originalMedia ?? true,
      oeStartsAt: input.oeStartsAt ? new Date(input.oeStartsAt) : null,
      oeEndsAt: input.oeEndsAt ? new Date(input.oeEndsAt) : null,
      auctionStartsAt: input.auctionStartsAt
        ? new Date(input.auctionStartsAt)
        : null,
      auctionEndsAt: input.auctionEndsAt
        ? new Date(input.auctionEndsAt)
        : null,
    },
  });

  const user = await prisma.user.findUnique({ where: { id: input.creatorId } });
  if (user && !user.firstListingAt) {
    await prisma.user.update({
      where: { id: input.creatorId },
      data: { firstListingAt: new Date() },
    });
  }

  if (input.publishSoftLaunch) {
    return transitionListingStage(created.id, "soft_launch");
  }

  return { ok: true as const, listing: toListing(created), errors: [] as string[] };
}

export async function transitionListingStage(
  listingId: string,
  target: LaunchStage,
) {
  const engine = await getDiscoveryEngine();
  const result = engine.transitionListing(listingId, target);
  if (!result.ok || !result.listing) {
    return { ok: false as const, errors: result.errors };
  }

  const listing = result.listing;
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  const memory = mode === "memory" || isMemoryMode();

  if (!memory) {
    await prisma.listing.update({
      where: { id: listingId },
      data: {
        stage: listing.stage,
        softLaunchedAt: listing.softLaunchedAt
          ? new Date(listing.softLaunchedAt)
          : null,
        risingEligibleAt: listing.risingEligibleAt
          ? new Date(listing.risingEligibleAt)
          : null,
        featuredAt: listing.featuredAt ? new Date(listing.featuredAt) : null,
      },
    });

    const creator = engine.state.creators.get(listing.creatorId);
    if (creator) {
      await persistCreatorStats(listing.creatorId, {
        risingEntriesThisWeek: creator.risingEntriesThisWeek,
        openLaneListingsToday: creator.openLaneListingsToday,
        firstListingAt: creator.firstListingAt
          ? new Date(creator.firstListingAt)
          : null,
      });
    }
  }

  let walletTx: unknown;
  if (target === "soft_launch") {
    const creatorProfile = engine.state.creators.get(listing.creatorId);
    const creatorAddress =
      creatorProfile?.wallets.find((w) => w.chain === listing.chain)?.address ??
      creatorProfile?.wallets[0]?.address ??
      "unknown";
    const tokenUri = listing.id.startsWith("listing")
      ? `freshmint://${listingId}`
      : `freshmint://${listingId}`;

    if (listing.chain === "evm") {
      const mint = buildEvmMintIntent({
        creatorAddress,
        tokenUri,
        listingId,
        priceUsd: listing.priceUsd,
      });
      walletTx = mint.walletTx;
      const server = await sendEvmMintWithServerKey({
        creatorAddress,
        tokenUri,
        priceWei: parseEther("0"),
      });
      if (server) {
        mint.txHash = server.txHash;
        mint.status = "submitted";
        walletTx = undefined;
      }
      if (!memory) {
        await prisma.listing.update({
          where: { id: listingId },
          data: {
            mintTxHash: mint.txHash || null,
            contractAddress: mint.contractAddress,
            tokenId: mint.tokenId,
          },
        });
      } else {
        const row = engine.state.listings.get(listingId);
        if (row) {
          engine.state.listings.set(listingId, {
            ...row,
            // mint fields live in DB only; keep stage advance in memory
          });
        }
      }
    } else {
      const mint = buildSolanaMintIntent({
        creatorAddress,
        metadataUri: tokenUri,
        listingId,
      });
      walletTx = mint.walletTx;
      const server = await sendSolanaMemoWithServerKey(String(mint.calldata));
      if (server) {
        mint.txHash = server.txHash;
        mint.status = "submitted";
        walletTx = undefined;
      }
      if (!memory) {
        await prisma.listing.update({
          where: { id: listingId },
          data: {
            mintTxHash: mint.txHash || null,
            contractAddress: mint.contractAddress,
            tokenId: mint.tokenId,
          },
        });
      }
    }
  }

  if (memory) {
    return {
      ok: true as const,
      listing: engine.state.listings.get(listingId) ?? listing,
      errors: [] as string[],
      walletTx,
    };
  }

  const updated = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
  });
  return {
    ok: true as const,
    listing: toListing(updated),
    errors: [] as string[],
    walletTx,
  };
}

async function inMemoryMode(): Promise<boolean> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  return mode === "memory" || isMemoryMode();
}

export async function recordSignal(input: {
  listingId: string;
  viewerId?: string | null;
  type: "impression" | "meaningful_view" | "save" | "follow" | "dwell";
  dwellMs?: number;
  bucket?: string;
}) {
  const sybil = await checkSignalSybil({
    viewerId: input.viewerId,
    listingId: input.listingId,
    type: input.type,
  });
  if (!sybil.allowed) {
    return { ok: false as const, error: sybil.reason ?? "sybil_blocked" };
  }
  const w = sybil.trustWeight;

  if (await inMemoryMode()) {
    const engine = await getDiscoveryEngine();
    const listing = engine.state.listings.get(input.listingId);
    const creator = listing
      ? engine.state.creators.get(listing.creatorId)
      : null;
    if (!listing || !creator) return { ok: false as const, error: "not_found" };
    const emerging = isEmergingListing(listing, creator).emerging;
    const s = { ...listing.signals };
    if (
      input.type === "impression" ||
      input.type === "dwell" ||
      input.type === "meaningful_view"
    ) {
      s.impressionsToday += 1;
      s.impressionsThisWeek += 1;
      if (w >= 0.5) s.uniqueViewers += 1;
    }
    if (input.dwellMs) s.dwellMsTotal += Math.round(input.dwellMs * w);
    if (input.type === "save" && w >= 0.4) s.saves += 1;
    if (input.type === "follow" && w >= 0.4) s.follows += 1;
    engine.state.listings.set(listing.id, { ...listing, signals: s });
    if (
      input.type === "impression" ||
      input.type === "dwell" ||
      input.type === "meaningful_view"
    ) {
      engine.metrics.record({
        type:
          input.type === "meaningful_view" ? "meaningful_view" : "impression",
        listingId: listing.id,
        creatorId: listing.creatorId,
        viewerId: input.viewerId ?? undefined,
        emerging,
        bucket: input.bucket,
        timestamp: Date.now(),
      });
    }
    return { ok: true as const, emerging, trustWeight: w };
  }

  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
    include: { creator: { include: { wallets: true } } },
  });
  if (!listing) return { ok: false as const, error: "not_found" };

  const engineListing = toListing(listing);
  const creatorProfile = {
    id: listing.creator.id,
    displayName: listing.creator.displayName,
    wallets: listing.creator.wallets.map((w) => ({
      chain: w.chain as Chain,
      address: w.address,
    })),
    firstListingAt: listing.creator.firstListingAt?.getTime() ?? null,
    lifetimePrimaryVolumeUsd: listing.creator.lifetimePrimaryVolumeUsd,
    completedSales: listing.creator.completedSales,
    flagged: listing.creator.flagged,
    washCluster: listing.creator.washCluster,
    verifiedCreator: listing.creator.verifiedCreator,
    walletCreatedAt: listing.creator.walletCreatedAt.getTime(),
    risingEntriesThisWeek: listing.creator.risingEntriesThisWeek,
    openLaneListingsToday: listing.creator.openLaneListingsToday,
    curatorScore: listing.creator.curatorScore,
    establishedBadge: listing.creator.establishedBadge,
  };
  const emerging = isEmergingListing(engineListing, creatorProfile).emerging;

  const data: Record<string, number> = {};
  if (input.type === "impression" || input.type === "dwell" || input.type === "meaningful_view") {
    data.impressionsToday = listing.impressionsToday + 1;
    data.impressionsThisWeek = listing.impressionsThisWeek + 1;
    data.uniqueViewers = listing.uniqueViewers + (w >= 0.5 ? 1 : 0);
  }
  if (input.dwellMs) {
    data.dwellMsTotal = listing.dwellMsTotal + Math.round(input.dwellMs * w);
  }
  if (input.type === "save" && w >= 0.4) {
    data.saves = listing.saves + 1;
  }
  if (input.type === "follow" && w >= 0.4) {
    data.follows = listing.follows + 1;
  }

  if (Object.keys(data).length) {
    await prisma.listing.update({ where: { id: listing.id }, data });
  }

  await prisma.signalEvent.create({
    data: {
      type: input.type,
      listingId: listing.id,
      creatorId: listing.creatorId,
      viewerId: input.viewerId ?? null,
      emerging,
      bucket: input.bucket ?? null,
      dwellMs: input.dwellMs ?? null,
      metaJson: JSON.stringify({ trustWeight: w }),
    },
  });

  return { ok: true as const, emerging, trustWeight: w };
}

/** Persist Follow graph edge (artist) — powers homepage Following mix. */
export async function followArtist(input: {
  followerId: string;
  artistId: string;
}) {
  if (input.followerId === input.artistId) {
    return { ok: false as const, error: "self_follow" };
  }

  const engine = await getDiscoveryEngine();
  if (!engine.state.creators.has(input.artistId)) {
    return { ok: false as const, error: "artist_not_found" };
  }

  const existing = engine.state.follows.get(input.followerId) ?? {
    collectorId: input.followerId,
    followedArtistIds: [],
    followedCollectorIds: [],
    followedShelfIds: [],
  };
  if (!existing.followedArtistIds.includes(input.artistId)) {
    existing.followedArtistIds = [...existing.followedArtistIds, input.artistId];
  }
  engine.state.follows.set(input.followerId, existing);

  if (!(await inMemoryMode())) {
    await prisma.follow.upsert({
      where: {
        followerId_followeeId_kind: {
          followerId: input.followerId,
          followeeId: input.artistId,
          kind: "artist",
        },
      },
      create: {
        followerId: input.followerId,
        followeeId: input.artistId,
        kind: "artist",
      },
      update: {},
    });
  }

  return {
    ok: true as const,
    followedArtistIds: existing.followedArtistIds,
  };
}

export async function unfollowArtist(input: {
  followerId: string;
  artistId: string;
}) {
  const engine = await getDiscoveryEngine();
  const existing = engine.state.follows.get(input.followerId);
  if (existing) {
    existing.followedArtistIds = existing.followedArtistIds.filter(
      (id) => id !== input.artistId,
    );
    engine.state.follows.set(input.followerId, existing);
  }

  if (!(await inMemoryMode())) {
    await prisma.follow.deleteMany({
      where: {
        followerId: input.followerId,
        followeeId: input.artistId,
        kind: "artist",
      },
    });
  }

  return {
    ok: true as const,
    followedArtistIds: existing?.followedArtistIds ?? [],
  };
}

export async function confirmOnchainTx(input: {
  listingId: string;
  action: "mint" | "buy";
  txHash: string;
  buyerId?: string;
}) {
  if (!input.txHash || input.txHash.length < 8) {
    return { ok: false as const, error: "invalid_tx" };
  }

  if (await inMemoryMode()) {
    const engine = await getDiscoveryEngine();
    const listing = engine.state.listings.get(input.listingId);
    if (!listing) return { ok: false as const, error: "not_found" };
    return { ok: true as const, txHash: input.txHash, mode: "memory" as const };
  }

  if (input.action === "mint") {
    await prisma.listing.update({
      where: { id: input.listingId },
      data: { mintTxHash: input.txHash },
    });
    return { ok: true as const, txHash: input.txHash };
  }

  const purchase = await prisma.purchase.findFirst({
    where: {
      listingId: input.listingId,
      ...(input.buyerId ? { buyerId: input.buyerId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  if (purchase) {
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { txHash: input.txHash },
    });
  }
  return { ok: true as const, txHash: input.txHash };
}

export async function nominateListingForUser(input: {
  listingId: string;
  nominatorId: string;
}) {
  const engine = await getDiscoveryEngine();
  const result = engine.nominate(input.listingId, input.nominatorId);
  if (!result.ok || !result.listing || !result.curator) {
    return { ok: false as const, error: result.error ?? "failed" };
  }

  if (await inMemoryMode()) {
    return { ok: true as const, listing: result.listing };
  }

  await persistListingSignals(input.listingId, {
    nominationScore: result.listing.signals.nominationScore,
  });
  await persistCreatorStats(input.nominatorId, {
    curatorScore: result.curator.curatorScore,
  });
  await prisma.nomination.create({
    data: {
      listingId: input.listingId,
      nominatorId: input.nominatorId,
      stakePoints: 10,
    },
  });

  return { ok: true as const, listing: result.listing };
}

export async function settleNomination(input: {
  nominationId: string;
  outcome: "success" | "abuse";
}) {
  const nomination = await prisma.nomination.findUnique({
    where: { id: input.nominationId },
  });
  if (!nomination) return { ok: false as const, error: "not_found" };
  const nominator = await prisma.user.findUnique({
    where: { id: nomination.nominatorId },
    include: { wallets: true },
  });
  if (!nominator) return { ok: false as const, error: "nominator_missing" };

  const updated = settleNominationOutcome(
    {
      id: nominator.id,
      displayName: nominator.displayName,
      wallets: [],
      firstListingAt: null,
      lifetimePrimaryVolumeUsd: 0,
      completedSales: 0,
      flagged: false,
      washCluster: false,
      verifiedCreator: false,
      walletCreatedAt: nominator.walletCreatedAt.getTime(),
      risingEntriesThisWeek: 0,
      openLaneListingsToday: 0,
      curatorScore: nominator.curatorScore,
      establishedBadge: false,
    },
    input.outcome,
  );

  await prisma.user.update({
    where: { id: nominator.id },
    data: { curatorScore: updated.curatorScore },
  });
  await prisma.nomination.update({
    where: { id: nomination.id },
    data: { outcome: input.outcome },
  });
  return { ok: true as const, curatorScore: updated.curatorScore };
}

export async function reportListingForUser(input: {
  listingId: string;
  reporterId: string;
  reason: ReportReason;
}) {
  const engine = await getDiscoveryEngine();
  const result = engine.reportListing({
    id: `report-${Date.now()}`,
    listingId: input.listingId,
    reporterId: input.reporterId,
    reason: input.reason,
  });
  if (!result.ok) return { ok: false as const, error: result.error };

  if (await inMemoryMode()) {
    return result;
  }

  await prisma.report.create({
    data: {
      listingId: input.listingId,
      reporterId: input.reporterId,
      reason: input.reason,
    },
  });
  await persistListingSignals(input.listingId, {
    delisted: result.listing.delisted,
    reportRate: result.listing.signals.reportRate,
    appealStatus: result.listing.appealStatus,
  });

  await prisma.signalEvent.create({
    data: {
      type: "report",
      listingId: input.listingId,
      creatorId: result.listing.creatorId,
      viewerId: input.reporterId,
      metaJson: JSON.stringify({ reason: input.reason, delisted: result.delisted }),
    },
  });

  return result;
}

export async function purchaseListing(input: {
  listingId: string;
  buyerId: string;
  amountUsd: number;
}) {
  const memory = await inMemoryMode();
  const engine = await getDiscoveryEngine();

  let listingRow: {
    id: string;
    creatorId: string;
    delisted: boolean;
    chain: Chain;
    contractAddress: string | null;
    tokenId: string | null;
    priceUsd: number | null;
  } | null = null;

  if (memory) {
    const l = engine.state.listings.get(input.listingId);
    if (!l || l.delisted) return { ok: false as const, error: "unavailable" };
    listingRow = {
      id: l.id,
      creatorId: l.creatorId,
      delisted: l.delisted,
      chain: l.chain,
      contractAddress: null,
      tokenId: null,
      priceUsd: l.priceUsd,
    };
  } else {
    const listing = await prisma.listing.findUnique({
      where: { id: input.listingId },
    });
    if (!listing || listing.delisted) {
      return { ok: false as const, error: "unavailable" };
    }
    listingRow = {
      id: listing.id,
      creatorId: listing.creatorId,
      delisted: listing.delisted,
      chain: listing.chain as Chain,
      contractAddress: listing.contractAddress,
      tokenId: listing.tokenId,
      priceUsd: listing.priceUsd,
    };
  }

  const listing = listingRow;

  const wash = await detectWashRisk({
    buyerId: input.buyerId,
    sellerId: listing.creatorId,
  });
  if (wash.wash) {
    await maybeFlagWashCluster(input.buyerId);
    if (!memory) {
      await prisma.signalEvent.create({
        data: {
          type: "rising_abuse",
          listingId: listing.id,
          creatorId: listing.creatorId,
          viewerId: input.buyerId,
          metaJson: JSON.stringify({
            reason: wash.reason,
            kind: "wash_purchase",
          }),
        },
      });
    }
    return { ok: false as const, error: wash.reason ?? "wash_blocked" };
  }

  let isFirst = true;
  let buyerAddress = "unknown";
  if (memory) {
    const buyer = engine.state.creators.get(input.buyerId);
    buyerAddress =
      buyer?.wallets.find((w) => w.chain === listing.chain)?.address ??
      buyer?.wallets[0]?.address ??
      "unknown";
  } else {
    const prior = await prisma.purchase.count({
      where: { buyerId: input.buyerId, listingId: input.listingId },
    });
    isFirst = prior === 0;
    const buyer = await prisma.user.findUnique({
      where: { id: input.buyerId },
      include: { wallets: true },
    });
    buyerAddress =
      buyer?.wallets.find((w) => w.chain === listing.chain)?.address ??
      buyer?.wallets[0]?.address ??
      "unknown";
  }

  const priceWei = String(Math.round(input.amountUsd * 1e15));
  const purchaseIntent =
    listing.chain === "evm"
      ? buildEvmPurchaseIntent({
          buyerAddress,
          contractAddress: listing.contractAddress ?? "0x0",
          tokenId: listing.tokenId ?? "0",
          priceWei,
        })
      : buildSolanaPurchaseIntent({
          buyerAddress,
          mintAddress: listing.contractAddress ?? "unknown",
          priceLamports: Math.round(input.amountUsd * 1_000_000),
          listingId: listing.id,
        });

  let txHash = purchaseIntent.txHash;
  let walletTx =
    "walletTx" in purchaseIntent ? purchaseIntent.walletTx : undefined;

  if (!memory && listing.chain === "evm") {
    const server = await sendEvmBuyWithServerKey({
      tokenId: listing.tokenId ?? "0",
      valueWei: BigInt(priceWei || "0"),
    });
    if (server) {
      txHash = server.txHash;
      walletTx = undefined;
    }
  } else if (!memory && "message" in purchaseIntent) {
    const server = await sendSolanaMemoWithServerKey(purchaseIntent.message);
    if (server) {
      txHash = server.txHash;
      walletTx = undefined;
    }
  }

  if (!txHash) {
    txHash = `pending:${listing.id}:${Date.now()}`;
  }

  engine.recordPurchase({
    listingId: input.listingId,
    buyerId: input.buyerId,
    amountUsd: input.amountUsd,
    isFirstPurchaseForBuyerOnArtifact: isFirst,
  });

  const creator = engine.state.creators.get(listing.creatorId);
  if (creator && memory) {
    creator.completedSales += 1;
    creator.lifetimePrimaryVolumeUsd += input.amountUsd;
  }

  const domainListing =
    engine.state.listings.get(listing.id) ??
    (!memory
      ? toListing(
          await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } }),
        )
      : null);
  const emerging =
    creator && domainListing
      ? isEmergingListing(domainListing, creator).emerging
      : false;

  if (!memory) {
    await prisma.purchase.create({
      data: {
        listingId: input.listingId,
        buyerId: input.buyerId,
        amountUsd: input.amountUsd,
        isFirst,
        txHash,
        chain: listing.chain,
      },
    });

    await prisma.user.update({
      where: { id: listing.creatorId },
      data: {
        completedSales: { increment: 1 },
        lifetimePrimaryVolumeUsd: { increment: input.amountUsd },
      },
    });

    await prisma.signalEvent.create({
      data: {
        type: isFirst ? "first_purchase" : "purchase",
        listingId: listing.id,
        creatorId: listing.creatorId,
        viewerId: input.buyerId,
        emerging,
        metaJson: JSON.stringify({ amountUsd: input.amountUsd, txHash }),
      },
    });
  }

  return { ok: true as const, txHash, isFirst, emerging, walletTx };
}

export async function getPersistedMetrics() {
  const engine = await getDiscoveryEngine();
  // Rebuild impression metrics from signal events for durability.
  const events = await prisma.signalEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  engine.metrics.clear();
  for (const e of events.reverse()) {
    if (
      e.type === "impression" ||
      e.type === "meaningful_view" ||
      e.type === "first_purchase" ||
      e.type === "purchase" ||
      e.type === "report" ||
      e.type === "duplicate_blocked" ||
      e.type === "rising_abuse"
    ) {
      engine.metrics.record({
        type: e.type as
          | "impression"
          | "meaningful_view"
          | "first_purchase"
          | "purchase"
          | "report"
          | "duplicate_blocked"
          | "rising_abuse",
        listingId: e.listingId ?? undefined,
        creatorId: e.creatorId ?? undefined,
        viewerId: e.viewerId ?? undefined,
        emerging: e.emerging,
        bucket: e.bucket ?? undefined,
        timestamp: e.createdAt.getTime(),
      });
    }
  }

  // Register first listings for TTFV
  const creators = await prisma.user.findMany({
    where: { firstListingAt: { not: null } },
  });
  for (const c of creators) {
    if (c.firstListingAt) {
      engine.metrics.registerCreatorFirstListing(c.id, c.firstListingAt.getTime());
    }
  }

  return {
    config: {
      emerging: engine.getConfig().emerging,
      emergingRisingQuota: engine.getConfig().emergingRisingQuota,
      feedMix: engine.getConfig().feedMix,
      risingSlotsPerDay: engine.getConfig().risingSlotsPerDay,
      featuredSlotsPerDay: engine.getConfig().featuredSlotsPerDay,
    },
    budgets: engine.getBudgets(),
    metrics: engine.metrics.snapshot(),
  };
}
