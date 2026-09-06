import "@/lib/env";
import { prisma } from "@/lib/db";
import { DiscoveryEngine } from "@/lib/discovery";
import { loadMarketplaceState, persistCreatorStats, persistListingSignals } from "@/lib/data/repository";
import { toCollection, toListing } from "@/lib/data/mappers";
import {
  marketAddressFor,
  resolveNetwork,
  vmFromNetwork,
} from "@/lib/chains/registry";
import type {
  Chain,
  Collection,
  LaunchStage,
  ListingType,
  NetworkId,
  ReportReason,
} from "@/lib/discovery/types";
import { isEmergingListing } from "@/lib/discovery";
import { settleNominationOutcome } from "@/lib/discovery/anti-spam";
import { validateDropWindow } from "@/lib/marketplace/calendar";
import {
  checkSignalSybil,
  detectWashRisk,
  maybeFlagWashCluster,
} from "@/lib/integrity/sybil";
import { isPostgresConfigured } from "@/lib/env";
import {
  dropWindowFor,
  parseDropKind,
  parseTraits,
  primarySupplyCap,
} from "@/lib/marketplace/drops";
import {
  buildEvmMintIntent,
  sendEvmMintWithServerKey,
  verifyEvmTx,
} from "@/lib/onchain/evm";
import {
  buildSolanaMintIntent,
  sendSolanaMemoWithServerKey,
  sendSolanaMetaplexMintWithServerKey,
  verifySolanaTx,
} from "@/lib/onchain/solana";
import {
  buildBoingMintIntent,
  verifyBoingTx,
} from "@/lib/onchain/boing";
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
  chain?: Chain;
  network?: NetworkId | string;
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
  collectionId?: string | null;
  isCollectionHero?: boolean;
  traits?: { trait_type: string; value: string }[];
  maxSupply?: number | null;
  publishSoftLaunch?: boolean;
}) {
  const engine = await getDiscoveryEngine();
  const network = resolveNetwork(input.network, input.chain);
  const chain = vmFromNetwork(network);
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

  if (input.type === "collection" && !input.collectionId) {
    return { ok: false as const, errors: ["collection_required"] };
  }
  if (input.collectionId) {
    const collection = engine.state.collections.get(input.collectionId);
    if (!collection) {
      return { ok: false as const, errors: ["collection_not_found"] };
    }
    if (collection.creatorId !== input.creatorId) {
      return { ok: false as const, errors: ["collection_forbidden"] };
    }
  }

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
    chain,
    network,
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
    collectionId: input.collectionId ?? null,
    isCollectionHero: Boolean(input.isCollectionHero),
    traits: parseTraits(input.traits ?? []),
    maxSupply:
      input.maxSupply != null && input.maxSupply > 0 ? input.maxSupply : null,
    signals: {
      saves: 0,
      follows: 0,
      dwellMsTotal: 0,
      uniqueViewers: 0,
      impressionsToday: 0,
      impressionsThisWeek: 0,
      pageViews: 0,
      reportRate: 0,
      nominationScore: 0,
    },
    delisted: false,
    appealStatus: "none" as const,
    mintTxHash: null,
    contractAddress: null,
    tokenId: null,
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
        wallets: [{ chain, address: `mem-${input.creatorId}`, network }],
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
    if (input.collectionId) {
      const attached = attachListingToCollectionState(
        mem.state.collections,
        input.collectionId,
        id,
        Boolean(input.isCollectionHero),
        input.creatorId,
      );
      if (!attached.ok) {
        mem.state.listings.delete(id);
        return attached;
      }
    }
    if (input.publishSoftLaunch) {
      return transitionListingStage(id, "soft_launch");
    }
    return { ok: true as const, listing, errors: [] as string[] };
  }

  const created = await prisma.listing.create({
    data: {
      title: input.title,
      description: input.description,
      creatorId: input.creatorId,
      type: input.type,
      chain,
      network,
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
      collectionId: input.collectionId ?? null,
      isCollectionHero: Boolean(input.isCollectionHero),
      traitsJson: JSON.stringify(parseTraits(input.traits ?? [])),
      maxSupply:
        input.maxSupply != null && input.maxSupply > 0 ? input.maxSupply : null,
    },
  });
  if (input.collectionId) {
    await syncCollectionMembership({
      collectionId: input.collectionId,
      listingId: created.id,
      creatorId: input.creatorId,
      isHero: Boolean(input.isCollectionHero),
    });
  }

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

export async function createCollectionForUser(input: {
  creatorId: string;
  title: string;
  chain?: Chain;
  network?: NetworkId | string;
  creatorAddress?: string | null;
}) {
  const title = input.title.trim();
  if (title.length < 1 || title.length > 120) {
    return { ok: false as const, errors: ["invalid_title"] };
  }
  const network = resolveNetwork(input.network, input.chain);
  const chain = vmFromNetwork(network);
  const creatorAddress = input.creatorAddress?.trim() || "";

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();

  let collection: Collection;

  if (mode === "memory" || isMemoryMode()) {
    collection = {
      id: `col-mem-${Date.now()}`,
      title,
      creatorId: input.creatorId,
      chain,
      network,
      heroListingId: null,
      sampleListingIds: [],
      totalItems: 0,
      dropKind: "none",
      dropStartsAt: null,
      dropEndsAt: null,
      dropPriceUsd: null,
      mediaBytes: 0,
      contractAddress: null,
      deployTxHash: null,
      deployStatus: "pending_wallet",
      escrowAddress: null,
    };
    const mem = getMemoryEngine();
    mem.state.collections.set(collection.id, collection);
  } else {
    const created = await prisma.collection.create({
      data: {
        title,
        creatorId: input.creatorId,
        chain,
        network,
        deployStatus: "pending_wallet",
      },
    });
    collection = toCollection(created);
  }

  const { buildCollectionDeployIntent } = await import("@/lib/onchain/collection");
  const deployIntent = buildCollectionDeployIntent({
    collectionId: collection.id,
    title: collection.title,
    creatorAddress:
      creatorAddress ||
      (
        await getDiscoveryEngine()
      ).state.creators
        .get(input.creatorId)
        ?.wallets.find((w) => w.chain === chain)?.address ||
      "",
    network,
    chain,
  });

  // Simulated deploys (no wallet / memory) are confirmed immediately.
  if (deployIntent.status === "simulated" && deployIntent.txHash) {
    const confirmed = await confirmCollectionDeploy({
      collectionId: collection.id,
      creatorId: input.creatorId,
      txHash: deployIntent.txHash,
      contractAddress: deployIntent.contractAddress,
      escrowAddress: deployIntent.escrowAddress,
    });
    if (confirmed.ok) {
      return {
        ok: true as const,
        collection: confirmed.collection,
        deployIntent: null,
        errors: [] as string[],
      };
    }
  }

  return {
    ok: true as const,
    collection: {
      ...collection,
      deployStatus: "pending_wallet",
      escrowAddress: deployIntent.escrowAddress,
    },
    deployIntent,
    errors: [] as string[],
  };
}

export async function confirmCollectionDeploy(input: {
  collectionId: string;
  creatorId: string;
  txHash: string;
  contractAddress?: string | null;
  escrowAddress?: string | null;
}) {
  if (!input.txHash || input.txHash.length < 8) {
    return { ok: false as const, error: "invalid_tx" };
  }
  const engine = await getDiscoveryEngine();
  const existing = engine.state.collections.get(input.collectionId);
  if (!existing) return { ok: false as const, error: "collection_not_found" };
  if (existing.creatorId !== input.creatorId) {
    return { ok: false as const, error: "collection_forbidden" };
  }

  const contractAddress =
    input.contractAddress?.trim() ||
    existing.contractAddress ||
    `pending:${input.collectionId}`;
  const escrowAddress =
    input.escrowAddress?.trim() ||
    existing.escrowAddress ||
    null;

  const next: Collection = {
    ...existing,
    contractAddress,
    deployTxHash: input.txHash,
    deployStatus: "confirmed",
    escrowAddress,
  };

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();

  if (mode === "memory" || isMemoryMode()) {
    getMemoryEngine().state.collections.set(input.collectionId, next);
    return { ok: true as const, collection: next };
  }

  const updated = await prisma.collection.update({
    where: { id: input.collectionId },
    data: {
      contractAddress,
      deployTxHash: input.txHash,
      deployStatus: "confirmed",
      escrowAddress,
    },
  });
  const mapped = toCollection(updated);
  engine.state.collections.set(input.collectionId, mapped);
  return { ok: true as const, collection: mapped };
}

export async function prepareCollectionPublishMints(input: {
  collectionId: string;
  creatorId: string;
  listingIds: string[];
  creatorAddress?: string | null;
}) {
  const engine = await getDiscoveryEngine();
  const collection = engine.state.collections.get(input.collectionId);
  if (!collection) return { ok: false as const, error: "collection_not_found" };
  if (collection.creatorId !== input.creatorId) {
    return { ok: false as const, error: "collection_forbidden" };
  }
  if (collection.deployStatus !== "confirmed" || !collection.contractAddress) {
    return { ok: false as const, error: "collection_not_deployed" };
  }

  const creator =
    input.creatorAddress?.trim() ||
    engine.state.creators
      .get(input.creatorId)
      ?.wallets.find((w) => w.chain === collection.chain)?.address ||
    "";

  const items = input.listingIds
    .map((id) => {
      const listing = engine.state.listings.get(id);
      if (!listing || listing.collectionId !== input.collectionId) return null;
      if (listing.tokenId && listing.mintTxHash) return null;
      return {
        listingId: listing.id,
        tokenUri:
          listing.mediaUrl ?? `https://freshmint.local/metadata/${listing.id}`,
        title: listing.title,
      };
    })
    .filter(Boolean) as { listingId: string; tokenUri: string; title: string }[];

  if (!items.length) {
    return { ok: true as const, batches: [], alreadyMinted: true as const };
  }

  const { buildCollectionMintBatches } = await import("@/lib/onchain/collection");
  const network = resolveNetwork(collection.network, collection.chain);
  const batches = buildCollectionMintBatches({
    network,
    chain: collection.chain,
    contractAddress: collection.contractAddress,
    creatorAddress: creator,
    escrowAddress: collection.escrowAddress || creator,
    items,
    startingTokenId: 1,
  });

  return { ok: true as const, batches, alreadyMinted: false as const };
}

export async function confirmCollectionMintBatch(input: {
  collectionId: string;
  creatorId: string;
  txHash: string;
  listingIds: string[];
  tokenIds?: string[];
  contractAddress?: string | null;
}) {
  if (!input.txHash || input.txHash.length < 8) {
    return { ok: false as const, error: "invalid_tx" };
  }
  const engine = await getDiscoveryEngine();
  const collection = engine.state.collections.get(input.collectionId);
  if (!collection) return { ok: false as const, error: "collection_not_found" };
  if (collection.creatorId !== input.creatorId) {
    return { ok: false as const, error: "collection_forbidden" };
  }

  const contractAddress =
    input.contractAddress?.trim() || collection.contractAddress || null;
  const tokenIds = input.tokenIds ?? [];

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  const memory = mode === "memory" || isMemoryMode();

  for (let i = 0; i < input.listingIds.length; i++) {
    const listingId = input.listingIds[i]!;
    const listing = engine.state.listings.get(listingId);
    if (!listing || listing.collectionId !== input.collectionId) continue;
    const tokenId = tokenIds[i] ?? listing.tokenId ?? String(i + 1);
    const next = {
      ...listing,
      mintTxHash: input.txHash,
      tokenId,
      contractAddress: contractAddress ?? listing.contractAddress,
    };
    if (memory) {
      getMemoryEngine().state.listings.set(listingId, next);
    } else {
      await prisma.listing.update({
        where: { id: listingId },
        data: {
          mintTxHash: input.txHash,
          tokenId,
          ...(contractAddress ? { contractAddress } : {}),
        },
      });
      engine.state.listings.set(listingId, next);
    }
  }

  return { ok: true as const, txHash: input.txHash };
}

export async function updateCollectionDrop(input: {
  collectionId: string;
  creatorId: string;
  dropKind: "limited" | "open";
  dropStartsAt: string;
  dropEndsAt: string;
  dropPriceUsd?: number | null;
}) {
  const engine = await getDiscoveryEngine();
  const existing = engine.state.collections.get(input.collectionId);
  if (!existing) return { ok: false as const, errors: ["collection_not_found"] };
  if (existing.creatorId !== input.creatorId) {
    return { ok: false as const, errors: ["collection_forbidden"] };
  }

  const startsAt = new Date(input.dropStartsAt).getTime();
  const endsAt = new Date(input.dropEndsAt).getTime();
  const cal = await validateDropWindow({
    type: "open_edition",
    startsAt,
    endsAt,
  });
  if (!cal.ok) return { ok: false as const, errors: cal.errors };

  const dropKind = parseDropKind(input.dropKind);
  if (dropKind === "none") {
    return { ok: false as const, errors: ["drop_kind_required"] };
  }
  const dropPriceUsd =
    input.dropPriceUsd != null && input.dropPriceUsd > 0
      ? input.dropPriceUsd
      : null;

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  const next: Collection = {
    ...existing,
    dropKind,
    dropStartsAt: startsAt,
    dropEndsAt: endsAt,
    dropPriceUsd,
    mediaBytes: existing.mediaBytes ?? 0,
  };

  if (mode === "memory" || isMemoryMode()) {
    getMemoryEngine().state.collections.set(input.collectionId, next);
    return { ok: true as const, collection: next, errors: [] as string[] };
  }

  const updated = await prisma.collection.update({
    where: { id: input.collectionId },
    data: {
      dropKind,
      dropStartsAt: new Date(startsAt),
      dropEndsAt: new Date(endsAt),
      dropPriceUsd,
    },
  });
  engine.state.collections.set(input.collectionId, toCollection(updated));
  return {
    ok: true as const,
    collection: toCollection(updated),
    errors: [] as string[],
  };
}

export async function reserveCollectionMedia(input: {
  collectionId: string;
  creatorId: string;
  size: number;
}) {
  const { COLLECTION_MEDIA_CAP_BYTES } = await import("@/lib/marketplace/drops");
  if (!(input.size > 0)) {
    return { ok: false as const, error: "empty_file" };
  }

  const engine = await getDiscoveryEngine();
  const existing = engine.state.collections.get(input.collectionId);
  if (!existing) return { ok: false as const, error: "collection_not_found" };
  if (existing.creatorId !== input.creatorId) {
    return { ok: false as const, error: "collection_forbidden" };
  }
  const used = existing.mediaBytes ?? 0;
  if (used + input.size > COLLECTION_MEDIA_CAP_BYTES) {
    return { ok: false as const, error: "collection_quota" };
  }

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  const mediaBytes = used + input.size;

  if (mode === "memory" || isMemoryMode()) {
    getMemoryEngine().state.collections.set(input.collectionId, {
      ...existing,
      mediaBytes,
    });
    return { ok: true as const, mediaBytes };
  }

  const updated = await prisma.collection.update({
    where: { id: input.collectionId },
    data: { mediaBytes },
  });
  engine.state.collections.set(input.collectionId, toCollection(updated));
  return { ok: true as const, mediaBytes: updated.mediaBytes };
}

export async function listCollectionsForUser(creatorId: string) {
  const engine = await getDiscoveryEngine();
  return [...engine.state.collections.values()].filter(
    (c) => c.creatorId === creatorId,
  );
}

function attachListingToCollectionState(
  collections: Map<string, Collection>,
  collectionId: string,
  listingId: string,
  isHero: boolean,
  creatorId: string,
) {
  const collection = collections.get(collectionId);
  if (!collection) {
    return { ok: false as const, errors: ["collection_not_found"] };
  }
  if (collection.creatorId !== creatorId) {
    return { ok: false as const, errors: ["collection_forbidden"] };
  }
  const samples = collection.sampleListingIds.includes(listingId)
    ? collection.sampleListingIds
    : [...collection.sampleListingIds, listingId].slice(0, 12);
  collections.set(collectionId, {
    ...collection,
    totalItems: collection.totalItems + 1,
    heroListingId:
      isHero || !collection.heroListingId
        ? listingId
        : collection.heroListingId,
    sampleListingIds: samples,
  });
  return { ok: true as const };
}

async function syncCollectionMembership(input: {
  collectionId: string;
  listingId: string;
  creatorId: string;
  isHero: boolean;
}) {
  const collection = await prisma.collection.findUnique({
    where: { id: input.collectionId },
  });
  if (!collection) {
    return { ok: false as const, errors: ["collection_not_found"] };
  }
  if (collection.creatorId !== input.creatorId) {
    return { ok: false as const, errors: ["collection_forbidden"] };
  }
  const samples = JSON.parse(collection.sampleIdsJson || "[]") as string[];
  if (!samples.includes(input.listingId)) {
    samples.push(input.listingId);
  }
  await prisma.collection.update({
    where: { id: input.collectionId },
    data: {
      totalItems: { increment: 1 },
      heroListingId:
        input.isHero || !collection.heroListingId
          ? input.listingId
          : collection.heroListingId,
      sampleIdsJson: JSON.stringify(samples.slice(0, 12)),
    },
  });
  return { ok: true as const };
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

  if (memory) {
    return {
      ok: true as const,
      listing: engine.state.listings.get(listingId) ?? listing,
      errors: [] as string[],
    };
  }

  const updated = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
  });
  return {
    ok: true as const,
    listing: toListing(updated),
    errors: [] as string[],
  };
}

async function mintListingToAddress(input: {
  listingId: string;
  ownerAddress: string;
}) {
  const engine = await getDiscoveryEngine();
  const listing = engine.state.listings.get(input.listingId);
  if (!listing) {
    return { ok: false as const, error: "unavailable" };
  }

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  const memory = mode === "memory" || isMemoryMode();
  const network = resolveNetwork(listing.network, listing.chain);
  const tokenUri =
    listing.mediaUrl ?? `https://freshmint.local/metadata/${listing.id}`;
  const ownerAddress = input.ownerAddress;

  let walletTx: unknown;
  let txHash: string | null = null;
  let contractAddress: string | null = listing.contractAddress ?? null;
  let tokenId: string | null = listing.tokenId ?? null;

  if (listing.chain === "evm") {
    const mint = buildEvmMintIntent({
      creatorAddress: ownerAddress,
      tokenUri,
      listingId: listing.id,
      network,
      priceUsd: listing.priceUsd,
    });
    walletTx = mint.walletTx;
    txHash = mint.txHash || null;
    contractAddress = mint.contractAddress;
    tokenId = mint.tokenId;
    const server = await sendEvmMintWithServerKey({
      creatorAddress: ownerAddress,
      tokenUri,
      network,
      priceWei: parseEther("0"),
    });
    if (server) {
      txHash = server.txHash;
      if (server.tokenId) tokenId = server.tokenId;
      walletTx = undefined;
    }
  } else if (listing.chain === "boing") {
    const mint = buildBoingMintIntent({
      creatorAddress: ownerAddress,
      metadataUri: tokenUri,
      listingId: listing.id,
      title: listing.title,
    });
    walletTx = mint.walletTx;
    txHash = mint.txHash || null;
    contractAddress = mint.contractAddress;
    tokenId = mint.tokenId;
  } else {
    const mint = buildSolanaMintIntent({
      creatorAddress: ownerAddress,
      metadataUri: tokenUri,
      listingId: listing.id,
      title: listing.title,
    });
    walletTx = mint.walletTx;
    txHash = mint.txHash || null;
    contractAddress = mint.contractAddress;
    tokenId = mint.tokenId;
    const mx = await sendSolanaMetaplexMintWithServerKey({
      metadataUri: tokenUri,
      name: listing.title,
      ownerAddress,
    });
    if (mx) {
      txHash = mx.txHash;
      contractAddress = mx.assetAddress;
      tokenId = mx.assetAddress;
      walletTx = undefined;
    } else {
      const server = await sendSolanaMemoWithServerKey(String(mint.calldata));
      if (server) {
        txHash = server.txHash;
        walletTx = undefined;
      }
    }
  }

  if (!txHash) {
    txHash = `pending-withdraw:${listing.id}:${Date.now()}`;
  }

  if (!memory) {
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        mintTxHash: listing.mintTxHash ?? txHash,
        contractAddress,
        tokenId,
        network,
      },
    });
  } else {
    const row = engine.state.listings.get(listing.id);
    if (row) {
      engine.state.listings.set(listing.id, {
        ...row,
        mintTxHash: row.mintTxHash ?? txHash,
        contractAddress,
        tokenId,
        network,
      });
    }
  }

  return {
    ok: true as const,
    txHash,
    walletTx,
    contractAddress,
    tokenId,
    chain: listing.chain,
    network,
  };
}

export async function withdrawPurchaseToWallet(input: {
  purchaseId: string;
  buyerId: string;
  destinationAddress?: string | null;
}) {
  const engine = await getDiscoveryEngine();
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryPurchases, updateMemoryPurchase } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();
  const memory = mode === "memory" || isMemoryMode();

  const purchase = memory
    ? getMemoryPurchases().find((p) => p.id === input.purchaseId)
    : await prisma.purchase.findUnique({ where: { id: input.purchaseId } });
  if (!purchase || purchase.buyerId !== input.buyerId) {
    return { ok: false as const, error: "unavailable" };
  }
  if (purchase.withdrawnAt) {
    return { ok: false as const, error: "already_withdrawn" };
  }
  // Crypto purchases deliver ownership at buy time — withdraw is legacy USD only.
  const cryptoPurchase =
    ("payNetwork" in purchase && purchase.payNetwork) ||
    ("paymentTxHash" in purchase && purchase.paymentTxHash);
  if (cryptoPurchase) {
    return { ok: false as const, error: "crypto_purchase_owned_at_buy" };
  }

  const listing = engine.state.listings.get(purchase.listingId);
  if (!listing) {
    return { ok: false as const, error: "unavailable" };
  }

  let destination = input.destinationAddress?.trim() || "";
  if (!destination) {
    const owner = engine.state.creators.get(input.buyerId);
    destination =
      owner?.wallets.find((w) => w.chain === listing.chain)?.address ??
      owner?.wallets[0]?.address ??
      "";
  }
  if (!destination) {
    return { ok: false as const, error: "wallet_required" };
  }

  const alreadyMinted = Boolean(
    listing.tokenId && listing.contractAddress && listing.mintTxHash,
  );

  let txHash: string | null = null;
  let walletTx: unknown;
  let chain = listing.chain;
  let network = resolveNetwork(listing.network, listing.chain);

  if (alreadyMinted) {
    const collection = listing.collectionId
      ? engine.state.collections.get(listing.collectionId)
      : null;
    const escrow =
      collection?.escrowAddress ||
      listing.contractAddress ||
      destination;
    const { buildWithdrawTransferIntent } = await import(
      "@/lib/onchain/collection"
    );
    try {
      const transfer = buildWithdrawTransferIntent({
        network,
        chain: listing.chain,
        contractAddress: listing.contractAddress!,
        tokenId: listing.tokenId!,
        escrowAddress: escrow!,
        destinationAddress: destination,
      });
      walletTx = transfer.walletTx;
      txHash = transfer.txHash || `pending-withdraw:${listing.id}:${Date.now()}`;
      chain = transfer.chain;
      network = transfer.network;
    } catch {
      return { ok: false as const, error: "transfer_unavailable" };
    }
  } else {
    // Legacy listings without publish mint — still mint on withdraw once.
    const minted = await mintListingToAddress({
      listingId: listing.id,
      ownerAddress: destination,
    });
    if (!minted.ok) return minted;
    txHash = minted.txHash;
    walletTx = minted.walletTx;
    chain = minted.chain;
    network = minted.network;
  }

  const withdrawnAt = Date.now();
  if (memory) {
    updateMemoryPurchase(purchase.id, {
      withdrawTxHash: txHash,
      withdrawAddress: destination,
      withdrawnAt,
    });
  } else {
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        withdrawTxHash: txHash,
        withdrawAddress: destination,
        withdrawnAt: new Date(withdrawnAt),
      },
    });
  }

  return {
    ok: true as const,
    purchaseId: purchase.id,
    listingId: listing.id,
    destinationAddress: destination,
    txHash,
    walletTx,
    chain,
    network,
    transfer: alreadyMinted,
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
  type: "impression" | "meaningful_view" | "save" | "follow" | "dwell" | "page_view";
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
    if (input.type === "impression") {
      s.impressionsToday += 1;
      s.impressionsThisWeek += 1;
    }
    if (input.type === "page_view" && w >= 0.3) {
      s.pageViews += 1;
    }
    if (input.dwellMs) s.dwellMsTotal += Math.round(input.dwellMs * w);
    if (
      (input.type === "impression" ||
        input.type === "dwell" ||
        input.type === "meaningful_view" ||
        input.type === "page_view") &&
      w >= 0.5 &&
      input.viewerId &&
      engine.markUniqueViewer(listing.id, input.viewerId)
    ) {
      s.uniqueViewers += 1;
    }
    if (input.type === "save" && w >= 0.4) s.saves += 1;
    if (input.type === "follow" && w >= 0.4) s.follows += 1;
    engine.state.listings.set(listing.id, { ...listing, signals: s });
    if (
      input.type === "impression" ||
      input.type === "meaningful_view" ||
      input.type === "page_view"
    ) {
      engine.metrics.record({
        type: input.type,
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
  if (input.type === "impression") {
    data.impressionsToday = listing.impressionsToday + 1;
    data.impressionsThisWeek = listing.impressionsThisWeek + 1;
  }
  if (input.type === "page_view" && w >= 0.3) {
    data.pageViews = listing.pageViews + 1;
  }
  if (
    (input.type === "impression" ||
      input.type === "dwell" ||
      input.type === "meaningful_view" ||
      input.type === "page_view") &&
    w >= 0.5 &&
    input.viewerId
  ) {
    const alreadyViewed = await prisma.signalEvent.findFirst({
      where: {
        listingId: listing.id,
        viewerId: input.viewerId,
        type: { in: ["impression", "dwell", "meaningful_view", "page_view"] },
      },
      select: { id: true },
    });
    if (!alreadyViewed) {
      data.uniqueViewers = listing.uniqueViewers + 1;
    }
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
  tokenId?: string;
  contractAddress?: string;
}) {
  if (!input.txHash || input.txHash.length < 8) {
    return { ok: false as const, error: "invalid_tx" };
  }

  if (await inMemoryMode()) {
    const engine = await getDiscoveryEngine();
    const listing = engine.state.listings.get(input.listingId);
    if (!listing) return { ok: false as const, error: "not_found" };
    engine.state.listings.set(input.listingId, {
      ...listing,
      mintTxHash: input.action === "mint" ? input.txHash : listing.mintTxHash,
      tokenId: input.tokenId ?? listing.tokenId,
      contractAddress: input.contractAddress ?? listing.contractAddress,
    });
    if (input.action === "buy") {
      const { getMemoryPurchases } = await import("@/lib/data/memory-store");
      const purchases = getMemoryPurchases();
      const row = [...purchases]
        .reverse()
        .find(
          (p) =>
            p.listingId === input.listingId &&
            (!input.buyerId || p.buyerId === input.buyerId),
        );
      if (row) row.txHash = input.txHash;
    }
    return { ok: true as const, txHash: input.txHash, mode: "memory" as const };
  }

  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
  });
  if (!listing) return { ok: false as const, error: "not_found" };

  const network = resolveNetwork(listing.network, listing.chain as Chain);
  let verifiedTokenId = input.tokenId ?? null;

  if (listing.chain === "evm") {
    const live = Boolean(marketAddressFor(network));
    const verified = await verifyEvmTx({
      network,
      txHash: input.txHash,
      expectContract: listing.contractAddress,
    });
    if (!verified.ok && live && !input.txHash.startsWith("pending:")) {
      return { ok: false as const, error: verified.error ?? "verify_failed" };
    }
    if (verified.tokenId) verifiedTokenId = verified.tokenId;
  } else if (listing.chain === "boing") {
    const live = Boolean(marketAddressFor("boing"));
    const verified = await verifyBoingTx(input.txHash);
    if (!verified && live && !input.txHash.startsWith("pending:")) {
      return { ok: false as const, error: "verify_failed" };
    }
  } else {
    const verified = await verifySolanaTx(input.txHash);
    if (
      !verified.ok &&
      !input.txHash.startsWith("pending:") &&
      process.env.SOLANA_REQUIRE_CONFIRM === "true"
    ) {
      return { ok: false as const, error: verified.error ?? "verify_failed" };
    }
  }

  if (input.action === "mint") {
    await prisma.listing.update({
      where: { id: input.listingId },
      data: {
        mintTxHash: input.txHash,
        ...(verifiedTokenId ? { tokenId: verifiedTokenId } : {}),
        ...(input.contractAddress
          ? { contractAddress: input.contractAddress }
          : {}),
      },
    });
    return {
      ok: true as const,
      txHash: input.txHash,
      tokenId: verifiedTokenId,
    };
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
    const { getMemoryNominations } = await import("@/lib/data/memory-store");
    const { DISCOVERY_CONFIG } = await import("@/lib/discovery/config");
    getMemoryNominations().push({
      id: `nom-mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      listingId: input.listingId,
      nominatorId: input.nominatorId,
      stakePoints: DISCOVERY_CONFIG.nominationStakePoints,
      createdAt: Date.now(),
      outcome: null,
    });
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

export async function listPendingNominations() {
  if (await inMemoryMode()) {
    const { getMemoryNominations, getMemoryEngine } = await import(
      "@/lib/data/memory-store"
    );
    const engine = getMemoryEngine();
    return getMemoryNominations()
      .filter((n) => !n.outcome)
      .map((n) => ({
        id: n.id,
        listingId: n.listingId,
        nominatorId: n.nominatorId,
        stakePoints: n.stakePoints,
        createdAt: new Date(n.createdAt).toISOString(),
        listingTitle: engine.state.listings.get(n.listingId)?.title ?? n.listingId,
        nominatorName:
          engine.state.creators.get(n.nominatorId)?.displayName ?? n.nominatorId,
      }));
  }

  const rows = await prisma.nomination.findMany({
    where: { outcome: null },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      listing: { select: { title: true } },
      nominator: { select: { displayName: true } },
    },
  });
  return rows.map((n) => ({
    id: n.id,
    listingId: n.listingId,
    nominatorId: n.nominatorId,
    stakePoints: n.stakePoints,
    createdAt: n.createdAt.toISOString(),
    listingTitle: n.listing.title,
    nominatorName: n.nominator.displayName,
  }));
}

export async function settleNomination(input: {
  nominationId: string;
  outcome: "success" | "abuse";
}) {
  if (await inMemoryMode()) {
    const { getMemoryNominations, getMemoryEngine } = await import(
      "@/lib/data/memory-store"
    );
    const nominations = getMemoryNominations();
    const nomination = nominations.find((n) => n.id === input.nominationId);
    if (!nomination || nomination.outcome) {
      return { ok: false as const, error: "not_found" };
    }
    const engine = getMemoryEngine();
    const nominator = engine.state.creators.get(nomination.nominatorId);
    if (!nominator) return { ok: false as const, error: "nominator_missing" };
    const updated = settleNominationOutcome(nominator, input.outcome);
    engine.state.creators.set(nominator.id, updated);
    nomination.outcome = input.outcome;
    return { ok: true as const, curatorScore: updated.curatorScore };
  }

  const nomination = await prisma.nomination.findUnique({
    where: { id: input.nominationId },
  });
  if (!nomination) return { ok: false as const, error: "not_found" };
  if (nomination.outcome) {
    return { ok: false as const, error: "already_settled" };
  }
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

async function loadPurchaseListingRow(listingId: string) {
  const engine = await getDiscoveryEngine();
  let memory = await inMemoryMode();
  const { getMemoryEngine } = await import("@/lib/data/memory-store");
  const fromCatalogMaps = () =>
    engine.state.listings.get(listingId) ??
    getMemoryEngine().state.listings.get(listingId) ??
    null;

  type ListingRow = {
    id: string;
    creatorId: string;
    delisted: boolean;
    chain: Chain;
    network: NetworkId;
    type: string;
    contractAddress: string | null;
    tokenId: string | null;
    mintTxHash: string | null;
    priceUsd: number | null;
    mediaUrl: string | null;
    collectionId: string | null;
    maxSupply: number | null;
    oeStartsAt: number | null;
    oeEndsAt: number | null;
    auctionStartsAt: number | null;
    auctionEndsAt: number | null;
  };

  let listingRow: ListingRow | null = null;

  if (memory) {
    const l = fromCatalogMaps();
    if (l && !l.delisted) {
      listingRow = {
        id: l.id,
        creatorId: l.creatorId,
        delisted: l.delisted,
        chain: l.chain,
        network: resolveNetwork(l.network, l.chain),
        type: l.type,
        contractAddress: l.contractAddress ?? null,
        tokenId: l.tokenId ?? null,
        mintTxHash: l.mintTxHash ?? null,
        priceUsd: l.priceUsd,
        mediaUrl: l.mediaUrl ?? null,
        collectionId: l.collectionId,
        maxSupply: l.maxSupply ?? null,
        oeStartsAt: l.oeStartsAt,
        oeEndsAt: l.oeEndsAt,
        auctionStartsAt: l.auctionStartsAt,
        auctionEndsAt: l.auctionEndsAt,
      };
    }
  }

  if (!listingRow && isPostgresConfigured()) {
    try {
      const listing = await prisma.listing.findUnique({
        where: { id: listingId },
      });
      if (listing && !listing.delisted) {
        memory = false;
        listingRow = {
          id: listing.id,
          creatorId: listing.creatorId,
          delisted: listing.delisted,
          chain: listing.chain as Chain,
          network: resolveNetwork(listing.network, listing.chain as Chain),
          type: listing.type,
          contractAddress: listing.contractAddress,
          tokenId: listing.tokenId,
          mintTxHash: listing.mintTxHash,
          priceUsd: listing.priceUsd,
          mediaUrl: listing.mediaUrl,
          collectionId: listing.collectionId,
          maxSupply: listing.maxSupply,
          oeStartsAt: listing.oeStartsAt?.getTime() ?? null,
          oeEndsAt: listing.oeEndsAt?.getTime() ?? null,
          auctionStartsAt: listing.auctionStartsAt?.getTime() ?? null,
          auctionEndsAt: listing.auctionEndsAt?.getTime() ?? null,
        };
      }
    } catch {
      // Catalog may still be in memory if Postgres dropped mid-request.
    }
  }

  if (!listingRow) {
    const l = fromCatalogMaps();
    if (!l || l.delisted) return { ok: false as const, error: "unavailable" as const };
    memory = true;
    listingRow = {
      id: l.id,
      creatorId: l.creatorId,
      delisted: l.delisted,
      chain: l.chain,
      network: resolveNetwork(l.network, l.chain),
      type: l.type,
      contractAddress: l.contractAddress ?? null,
      tokenId: l.tokenId ?? null,
      mintTxHash: l.mintTxHash ?? null,
      priceUsd: l.priceUsd,
      mediaUrl: l.mediaUrl ?? null,
      collectionId: l.collectionId,
      maxSupply: l.maxSupply ?? null,
      oeStartsAt: l.oeStartsAt,
      oeEndsAt: l.oeEndsAt,
      auctionStartsAt: l.auctionStartsAt,
      auctionEndsAt: l.auctionEndsAt,
    };
  }

  return { ok: true as const, listing: listingRow, memory, engine };
}

/** Crypto-only primary buy: pay/bridge native, then escrow→buyer transfer. */
export async function purchaseListing(input: {
  listingId: string;
  buyerId: string;
  payNetwork: NetworkId;
  buyerPaymentAddress: string;
  buyerReceiveAddress: string;
  amountUsd?: number;
  /** Tests / local: complete payment+transfer in one shot. */
  simulate?: boolean;
  paymentTxHash?: string;
  transferTxHash?: string;
  bridgeRequestId?: string;
}) {
  const {
    assertCryptoPayAllowed,
    buildCrossChainPayQuote,
    buildNativePaymentWalletTx,
    buildPurchaseTransferIntent,
    listingIsMinted,
    payNetworksForListing,
    publicPayQuote,
    settlementAddressFor,
    splitSaleProceeds,
  } = await import("@/lib/marketplace/crypto-purchase");
  const { platformFeeRecipients } = await import("@/lib/fees/platform");

  const loaded = await loadPurchaseListingRow(input.listingId);
  if (!loaded.ok) return loaded;
  const { listing, memory, engine } = loaded;

  const amountUsd = input.amountUsd ?? listing.priceUsd ?? 0;
  if (!(amountUsd > 0)) {
    return { ok: false as const, error: "unavailable" };
  }

  const payCheck = assertCryptoPayAllowed({
    listingNetwork: listing.network,
    payNetwork: input.payNetwork,
  });
  if (!payCheck.ok) {
    return { ok: false as const, error: payCheck.error };
  }

  if (!listingIsMinted(listing)) {
    return { ok: false as const, error: "listing_not_minted" };
  }

  const fees = splitSaleProceeds(amountUsd);
  const feeRecipients = platformFeeRecipients();

  const collection = listing.collectionId
    ? engine.state.collections.get(listing.collectionId) ?? null
    : null;
  const window = dropWindowFor(listing, collection);
  if (window.state === "upcoming") {
    return { ok: false as const, error: "drop_not_started" };
  }
  if (window.state === "ended") {
    return { ok: false as const, error: "drop_ended" };
  }

  const soldCount = memory
    ? (await import("@/lib/data/memory-store"))
        .getMemoryPurchases()
        .filter(
          (p) => p.listingId === listing.id && (p.status ?? "completed") !== "failed",
        ).length
    : await prisma.purchase.count({
        where: {
          listingId: listing.id,
          NOT: { status: "failed" },
        },
      });
  const cap = primarySupplyCap(listing);
  if (cap != null && soldCount >= cap) {
    return { ok: false as const, error: "already_sold" };
  }

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
  if (memory) {
    const { getMemoryPurchases } = await import("@/lib/data/memory-store");
    isFirst = !getMemoryPurchases().some(
      (p) => p.buyerId === input.buyerId && p.listingId === input.listingId,
    );
  } else {
    const prior = await prisma.purchase.count({
      where: { buyerId: input.buyerId, listingId: input.listingId },
    });
    isFirst = prior === 0;
  }

  const settlementAddress = settlementAddressFor(listing.network);
  const escrowAddress =
    collection?.escrowAddress ||
    listing.contractAddress ||
    settlementAddress;
  const crossChain = input.payNetwork !== listing.network;

  let paymentWalletTx: Record<string, unknown> | undefined;
  let bridgeQuote: Awaited<ReturnType<typeof buildCrossChainPayQuote>> | null =
    null;
  let settleQuote = (
    await import("@/lib/onchain/fx")
  ).quoteNativeFromUsd(amountUsd, listing.chain);

  if (crossChain) {
    try {
      bridgeQuote = await buildCrossChainPayQuote({
        listingNetwork: listing.network,
        payNetwork: input.payNetwork,
        amountUsd,
        buyerPaymentAddress: input.buyerPaymentAddress,
        settlementAddress,
      });
      settleQuote = bridgeQuote.settle;
    } catch (e) {
      return {
        ok: false as const,
        error:
          e instanceof Error && e.message.includes("boing")
            ? "boing_same_chain_only"
            : e instanceof Error
              ? e.message
              : "bridge_quote_failed",
      };
    }
  } else {
    const pay = await buildNativePaymentWalletTx({
      network: listing.network,
      fromAddress: input.buyerPaymentAddress,
      toAddress: settlementAddress,
      amountUsd,
      listingChain: listing.chain,
    });
    paymentWalletTx = pay.walletTx;
    settleQuote = pay.quote;
  }

  const transferIntent = buildPurchaseTransferIntent({
    listingNetwork: listing.network,
    listingChain: listing.chain,
    contractAddress: listing.contractAddress!,
    tokenId: listing.tokenId!,
    escrowAddress: escrowAddress!,
    buyerReceiveAddress: input.buyerReceiveAddress,
  });

  const simulateComplete = Boolean(
    input.simulate &&
      (input.paymentTxHash || input.transferTxHash || !crossChain),
  );
  const paymentTxHash =
    input.paymentTxHash ||
    (simulateComplete ? `sim-pay:${listing.id}:${Date.now()}` : null);
  const transferTxHash =
    input.transferTxHash ||
    (simulateComplete
      ? `sim-xfer:${listing.id}:${Date.now()}`
      : null);
  const status = simulateComplete
    ? "completed"
    : paymentTxHash
      ? "pending_transfer"
      : "pending_payment";
  const withdrawnAt = simulateComplete ? Date.now() : null;
  const txHash =
    transferTxHash ||
    paymentTxHash ||
    `pending:${listing.id}:${Date.now()}`;

  if (simulateComplete || status === "completed") {
    engine.recordPurchase({
      listingId: input.listingId,
      buyerId: input.buyerId,
      amountUsd,
      isFirstPurchaseForBuyerOnArtifact: isFirst,
    });
  }

  const creator = engine.state.creators.get(listing.creatorId);
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

  let purchaseId: string;
  if (memory) {
    const { recordMemoryPurchase } = await import("@/lib/data/memory-store");
    const row = recordMemoryPurchase({
      listingId: listing.id,
      buyerId: input.buyerId,
      amountUsd,
      feeTotalUsd: fees.feeTotalUsd,
      feeTreasuryUsd: fees.feeTreasuryUsd,
      feeOperatorUsd: fees.feeOperatorUsd,
      sellerNetUsd: fees.sellerNetUsd,
      soldAt: Date.now(),
      status,
      payNetwork: input.payNetwork,
      paymentTxHash,
      bridgeRequestId: input.bridgeRequestId ?? bridgeQuote?.bridge?.requestId ?? null,
      txHash,
      chain: listing.chain,
      withdrawTxHash: transferTxHash,
      withdrawAddress: input.buyerReceiveAddress,
      withdrawnAt,
    });
    purchaseId = row.id;
  } else {
    const row = await prisma.purchase.create({
      data: {
        listingId: input.listingId,
        buyerId: input.buyerId,
        amountUsd,
        feeTotalUsd: fees.feeTotalUsd,
        feeTreasuryUsd: fees.feeTreasuryUsd,
        feeOperatorUsd: fees.feeOperatorUsd,
        sellerNetUsd: fees.sellerNetUsd,
        isFirst,
        status,
        payNetwork: input.payNetwork,
        paymentTxHash,
        bridgeRequestId:
          input.bridgeRequestId ?? bridgeQuote?.bridge?.requestId ?? null,
        txHash,
        chain: listing.chain,
        withdrawTxHash: transferTxHash,
        withdrawAddress: input.buyerReceiveAddress,
        withdrawnAt: withdrawnAt ? new Date(withdrawnAt) : null,
      },
    });
    purchaseId = row.id;

    if (status === "completed") {
      await prisma.user.update({
        where: { id: listing.creatorId },
        data: {
          completedSales: { increment: 1 },
          lifetimePrimaryVolumeUsd: { increment: amountUsd },
        },
      });

      await prisma.signalEvent.create({
        data: {
          type: isFirst ? "first_purchase" : "purchase",
          listingId: listing.id,
          creatorId: listing.creatorId,
          viewerId: input.buyerId,
          emerging,
          metaJson: JSON.stringify({
            amountUsd,
            txHash,
            fees,
            feeRecipients,
            payNetwork: input.payNetwork,
          }),
        },
      });
    }
  }

  return {
    ok: true as const,
    purchaseId,
    status,
    txHash,
    paymentTxHash,
    transferTxHash,
    isFirst,
    emerging,
    paymentWalletTx,
    transferWalletTx: transferIntent.walletTx,
    bridge: bridgeQuote?.bridge
      ? {
          requestId: bridgeQuote.bridge.requestId,
          fromNetwork: bridgeQuote.bridge.fromNetwork,
          toNetwork: bridgeQuote.bridge.toNetwork,
          amount: bridgeQuote.bridge.amount,
          estimatedOutput: bridgeQuote.bridge.estimatedOutput,
          feeUsd: bridgeQuote.bridge.feeUsd,
          steps: bridgeQuote.bridge.steps,
        }
      : null,
    quote: publicPayQuote({
      settle: settleQuote,
      pay: bridgeQuote?.pay ?? settleQuote,
      bridged: crossChain,
    }),
    settlementAddress,
    fees,
    feeRecipients,
    chain: listing.chain,
    network: listing.network,
    payNetwork: input.payNetwork,
    payNetworks: payNetworksForListing(listing.network),
    buyerReceiveAddress: input.buyerReceiveAddress,
  };
}

export async function quoteCryptoPurchase(input: {
  listingId: string;
  payNetwork: NetworkId;
}) {
  const {
    assertCryptoPayAllowed,
    listingIsMinted,
    payNetworksForListing,
    publicPayQuote,
    settlementAddressFor,
    splitSaleProceeds,
  } = await import("@/lib/marketplace/crypto-purchase");
  const { quotePayInFromUsdAt } = await import("@/lib/onchain/fx");

  const loaded = await loadPurchaseListingRow(input.listingId);
  if (!loaded.ok) return loaded;
  const { listing } = loaded;
  const amountUsd = listing.priceUsd ?? 0;
  if (!(amountUsd > 0)) {
    return { ok: false as const, error: "unavailable" };
  }
  if (!listingIsMinted(listing)) {
    return { ok: false as const, error: "listing_not_minted" };
  }
  const payCheck = assertCryptoPayAllowed({
    listingNetwork: listing.network,
    payNetwork: input.payNetwork,
  });
  if (!payCheck.ok) {
    return { ok: false as const, error: payCheck.error };
  }

  const quotes = quotePayInFromUsdAt({
    amountUsd,
    listingChain: listing.chain,
    payNetwork: input.payNetwork,
  });
  const bridged = input.payNetwork !== listing.network;
  return {
    ok: true as const,
    listingId: listing.id,
    network: listing.network,
    chain: listing.chain,
    payNetwork: input.payNetwork,
    payNetworks: payNetworksForListing(listing.network),
    amountUsd,
    fees: splitSaleProceeds(amountUsd),
    settlementAddress: settlementAddressFor(listing.network),
    quote: publicPayQuote({
      settle: quotes.settle,
      pay: quotes.pay,
      bridged,
    }),
  };
}

export async function confirmCryptoPurchase(input: {
  purchaseId: string;
  buyerId: string;
  step: "payment" | "transfer";
  txHash: string;
  bridgeRequestId?: string;
}) {
  const {
    buildPurchaseTransferIntent,
    listingIsMinted,
  } = await import("@/lib/marketplace/crypto-purchase");
  const engine = await getDiscoveryEngine();
  const { isMemoryMode, getMemoryPurchases, updateMemoryPurchase } =
    await import("@/lib/data/memory-store");
  const memory = (await inMemoryMode()) || isMemoryMode();

  const purchase = memory
    ? getMemoryPurchases().find((p) => p.id === input.purchaseId)
    : await prisma.purchase.findUnique({ where: { id: input.purchaseId } });
  if (!purchase || purchase.buyerId !== input.buyerId) {
    return { ok: false as const, error: "unavailable" };
  }

  const listing = engine.state.listings.get(purchase.listingId);
  if (!listing || !listingIsMinted(listing)) {
    return { ok: false as const, error: "unavailable" };
  }

  const network = resolveNetwork(listing.network, listing.chain);
  const collection = listing.collectionId
    ? engine.state.collections.get(listing.collectionId)
    : null;

  if (input.step === "payment") {
    if (
      purchase.status === "completed" ||
      purchase.status === "pending_transfer"
    ) {
      const transferIntent = buildPurchaseTransferIntent({
        listingNetwork: network,
        listingChain: listing.chain,
        contractAddress: listing.contractAddress!,
        tokenId: listing.tokenId!,
        escrowAddress:
          collection?.escrowAddress ||
          listing.contractAddress ||
          purchase.withdrawAddress ||
          "",
        buyerReceiveAddress:
          purchase.withdrawAddress ||
          input.buyerId,
      });
      return {
        ok: true as const,
        purchaseId: purchase.id,
        status: purchase.status === "completed" ? "completed" : "pending_transfer",
        transferWalletTx: transferIntent.walletTx,
      };
    }
    const patch = {
      status: "pending_transfer",
      paymentTxHash: input.txHash,
      bridgeRequestId: input.bridgeRequestId ?? purchase.bridgeRequestId,
      txHash: input.txHash,
    };
    if (memory) {
      updateMemoryPurchase(purchase.id, patch);
    } else {
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: patch,
      });
    }
    const receive =
      purchase.withdrawAddress ||
      engine.state.creators
        .get(input.buyerId)
        ?.wallets.find((w) => w.chain === listing.chain)?.address ||
      "";
    const transferIntent = buildPurchaseTransferIntent({
      listingNetwork: network,
      listingChain: listing.chain,
      contractAddress: listing.contractAddress!,
      tokenId: listing.tokenId!,
      escrowAddress:
        collection?.escrowAddress || listing.contractAddress || receive,
      buyerReceiveAddress: receive || input.txHash.slice(0, 42),
    });
    return {
      ok: true as const,
      purchaseId: purchase.id,
      status: "pending_transfer" as const,
      transferWalletTx: transferIntent.walletTx,
    };
  }

  // transfer step
  const withdrawnAt = Date.now();
  const completePatch = {
    status: "completed",
    txHash: input.txHash,
    withdrawTxHash: input.txHash,
    withdrawnAt,
  };

  if (memory) {
    updateMemoryPurchase(purchase.id, {
      ...completePatch,
      withdrawnAt,
    });
  } else {
    const wasComplete = purchase.status === "completed";
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        status: "completed",
        txHash: input.txHash,
        withdrawTxHash: input.txHash,
        withdrawnAt: new Date(withdrawnAt),
      },
    });
    if (!wasComplete) {
      const isFirst =
        "isFirst" in purchase ? Boolean(purchase.isFirst) : true;
      engine.recordPurchase({
        listingId: purchase.listingId,
        buyerId: input.buyerId,
        amountUsd: purchase.amountUsd,
        isFirstPurchaseForBuyerOnArtifact: isFirst,
      });
      await prisma.user.update({
        where: { id: listing.creatorId },
        data: {
          completedSales: { increment: 1 },
          lifetimePrimaryVolumeUsd: { increment: purchase.amountUsd },
        },
      });
      await prisma.signalEvent.create({
        data: {
          type: isFirst ? "first_purchase" : "purchase",
          listingId: listing.id,
          creatorId: listing.creatorId,
          viewerId: input.buyerId,
          metaJson: JSON.stringify({
            amountUsd: purchase.amountUsd,
            txHash: input.txHash,
            payNetwork:
              "payNetwork" in purchase ? purchase.payNetwork : null,
          }),
        },
      });
    }
  }

  if (memory && purchase.status !== "completed") {
    engine.recordPurchase({
      listingId: purchase.listingId,
      buyerId: input.buyerId,
      amountUsd: purchase.amountUsd,
      isFirstPurchaseForBuyerOnArtifact: true,
    });
  }

  return {
    ok: true as const,
    purchaseId: purchase.id,
    status: "completed" as const,
    txHash: input.txHash,
    withdrawnAt,
  };
}

export async function getPersistedMetrics() {
  const engine = await getDiscoveryEngine();
  const { evaluateDiscoveryPolicy } = await import("@/lib/discovery/policy");

  if (await inMemoryMode()) {
    const metrics = engine.metrics.snapshot();
    return {
      config: {
        emerging: engine.getConfig().emerging,
        emergingRisingQuota: engine.getConfig().emergingRisingQuota,
        feedMix: engine.getConfig().feedMix,
        risingSlotsPerDay: engine.getConfig().risingSlotsPerDay,
        featuredSlotsPerDay: engine.getConfig().featuredSlotsPerDay,
      },
      budgets: engine.getBudgets(),
      metrics,
      policy: evaluateDiscoveryPolicy(metrics),
    };
  }

  // Rebuild impression metrics from signal events for durability.
  let events: Awaited<ReturnType<typeof prisma.signalEvent.findMany>> = [];
  try {
    events = await prisma.signalEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
  } catch {
    const metrics = engine.metrics.snapshot();
    return {
      config: {
        emerging: engine.getConfig().emerging,
        emergingRisingQuota: engine.getConfig().emergingRisingQuota,
        feedMix: engine.getConfig().feedMix,
        risingSlotsPerDay: engine.getConfig().risingSlotsPerDay,
        featuredSlotsPerDay: engine.getConfig().featuredSlotsPerDay,
      },
      budgets: engine.getBudgets(),
      metrics,
      policy: evaluateDiscoveryPolicy(metrics),
    };
  }
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

  const metrics = engine.metrics.snapshot();
  return {
    config: {
      emerging: engine.getConfig().emerging,
      emergingRisingQuota: engine.getConfig().emergingRisingQuota,
      feedMix: engine.getConfig().feedMix,
      risingSlotsPerDay: engine.getConfig().risingSlotsPerDay,
      featuredSlotsPerDay: engine.getConfig().featuredSlotsPerDay,
    },
    budgets: engine.getBudgets(),
    metrics,
    policy: evaluateDiscoveryPolicy(metrics),
  };
}
