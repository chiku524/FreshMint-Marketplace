import "@/lib/env";
import { createHash } from "node:crypto";
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
  Listing,
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
  isProvisionalBoingCollectionAddress,
  resolveBoingNftDeployTemplateVersion,
  verifyBoingTx,
} from "@/lib/onchain/boing";
import { hashTextMedia } from "@/lib/media/upload";
import { parseEther } from "viem";

export async function getDiscoveryEngine(): Promise<DiscoveryEngine> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const mode = await ensureDatabaseReady();
  if (mode === "memory") {
    const { getMemoryEngine } = await import("@/lib/data/memory-store");
    const engine = getMemoryEngine();
    engine.promoteEligibleSoftLaunches();
    return engine;
  }

  try {
    const state = await loadMarketplaceState();
    const engine = new DiscoveryEngine(state);
    const promoted = engine.promoteEligibleSoftLaunches();
    if (promoted.length) {
      await persistRisingPromotions(engine, promoted);
    }
    return engine;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { enableMemoryMode, getMemoryEngine } = await import(
      "@/lib/data/memory-store"
    );
    enableMemoryMode(message);
    const engine = getMemoryEngine();
    engine.promoteEligibleSoftLaunches();
    return engine;
  }
}

async function persistRisingPromotions(
  engine: DiscoveryEngine,
  promoted: Listing[],
) {
  for (const listing of promoted) {
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        stage: listing.stage,
        risingEligibleAt: listing.risingEligibleAt
          ? new Date(listing.risingEligibleAt)
          : null,
      },
    });
    const creator = engine.state.creators.get(listing.creatorId);
    if (!creator) continue;
    await persistCreatorStats(listing.creatorId, {
      risingEntriesThisWeek: creator.risingEntriesThisWeek,
      openLaneListingsToday: creator.openLaneListingsToday,
      firstListingAt: creator.firstListingAt
        ? new Date(creator.firstListingAt)
        : null,
    });
  }
}

export function hashMedia(content: string): string {
  return hashTextMedia(content);
}

type CreateListingReuseInput = {
  creatorId: string;
  title: string;
  description: string;
  type: ListingType;
  chain: Chain;
  network: NetworkId;
  priceUsd?: number | null;
  medium: string;
  styleTags: string[];
  mediaHash: string;
  mediaUrl: string | null;
  metadataComplete?: boolean;
  originalMedia?: boolean;
  oeStartsAt?: string | null;
  oeEndsAt?: string | null;
  auctionStartsAt?: string | null;
  auctionEndsAt?: string | null;
  saleMode?: "fixed" | "timed_window" | "english" | string | null;
  startingBidUsd?: number | null;
  reserveUsd?: number | null;
  collectionId?: string | null;
  isCollectionHero?: boolean;
  traits?: { trait_type: string; value: string }[];
  maxSupply?: number | null;
  publishSoftLaunch?: boolean;
};

/**
 * Reuse an existing same-creator listing on create/mint retry so partial
 * batches do not fail with duplicate_media after drafts were already kept.
 */
async function reuseDraftListingForCreate(opts: {
  engine: DiscoveryEngine;
  existing: Listing;
  input: CreateListingReuseInput;
}): Promise<
  | { ok: true; listing: Listing; errors: string[]; reused: true }
  | {
      ok: true;
      listing: Listing;
      errors: string[];
      softLaunchBlocked: true;
      reused: true;
    }
> {
  const { engine, existing, input } = opts;
  const traits = parseTraits(input.traits ?? []);
  const maxSupply =
    input.maxSupply != null && input.maxSupply > 0 ? input.maxSupply : null;
  const saleMode =
    (input.saleMode as string | undefined) ??
    (input.type === "auction" ? "timed_window" : "fixed");

  // Only refresh editable fields while still a draft — don't rewrite live works.
  if (existing.stage === "draft") {
    const next: Listing = {
      ...existing,
      title: input.title,
      description: input.description,
      type: input.type,
      chain: input.chain,
      network: input.network,
      priceUsd: input.priceUsd ?? null,
      medium: input.medium,
      styleTags: input.styleTags,
      mediaUrl: input.mediaUrl ?? existing.mediaUrl,
      metadataComplete: input.metadataComplete ?? existing.metadataComplete,
      originalMedia: input.originalMedia ?? existing.originalMedia,
      oeStartsAt: input.oeStartsAt ? new Date(input.oeStartsAt).getTime() : null,
      oeEndsAt: input.oeEndsAt ? new Date(input.oeEndsAt).getTime() : null,
      auctionStartsAt: input.auctionStartsAt
        ? new Date(input.auctionStartsAt).getTime()
        : null,
      auctionEndsAt: input.auctionEndsAt
        ? new Date(input.auctionEndsAt).getTime()
        : null,
      saleMode,
      startingBidUsd: input.startingBidUsd ?? null,
      reserveUsd: input.reserveUsd ?? null,
      collectionId: input.collectionId ?? existing.collectionId,
      isCollectionHero: Boolean(
        input.isCollectionHero ?? existing.isCollectionHero,
      ),
      traits,
      maxSupply,
    };

    if (await inMemoryMode()) {
      engine.state.listings.set(existing.id, next);
      if (
        input.collectionId &&
        existing.collectionId !== input.collectionId
      ) {
        const attached = attachListingToCollectionState(
          engine.state.collections,
          input.collectionId,
          existing.id,
          Boolean(input.isCollectionHero),
          input.creatorId,
        );
        if (!attached.ok) {
          engine.state.listings.set(existing.id, existing);
          return {
            ok: true as const,
            listing: existing,
            errors: attached.errors,
            reused: true as const,
          };
        }
      }
    } else {
      await prisma.listing.update({
        where: { id: existing.id },
        data: {
          title: next.title,
          description: next.description,
          type: next.type,
          chain: next.chain,
          network: next.network,
          priceUsd: next.priceUsd,
          medium: next.medium,
          styleTagsJson: JSON.stringify(next.styleTags),
          mediaUrl: next.mediaUrl,
          metadataComplete: next.metadataComplete,
          originalMedia: next.originalMedia,
          oeStartsAt: input.oeStartsAt ? new Date(input.oeStartsAt) : null,
          oeEndsAt: input.oeEndsAt ? new Date(input.oeEndsAt) : null,
          auctionStartsAt: input.auctionStartsAt
            ? new Date(input.auctionStartsAt)
            : null,
          auctionEndsAt: input.auctionEndsAt
            ? new Date(input.auctionEndsAt)
            : null,
          saleMode,
          startingBidUsd: next.startingBidUsd,
          reserveUsd: next.reserveUsd,
          collectionId: next.collectionId,
          isCollectionHero: next.isCollectionHero,
          traitsJson: JSON.stringify(traits),
          maxSupply: next.maxSupply,
        },
      });
      if (
        input.collectionId &&
        existing.collectionId !== input.collectionId
      ) {
        await syncCollectionMembership({
          collectionId: input.collectionId,
          listingId: existing.id,
          creatorId: input.creatorId,
          isHero: Boolean(input.isCollectionHero),
        });
      }
      engine.state.listings.set(existing.id, next);
    }

    if (input.publishSoftLaunch) {
      const staged = await transitionListingStage(existing.id, "soft_launch");
      if (staged.ok) {
        return { ...staged, reused: true as const };
      }
      const draftListing = engine.state.listings.get(existing.id) ?? next;
      return {
        ok: true as const,
        listing: draftListing,
        errors: staged.errors,
        softLaunchBlocked: true as const,
        reused: true as const,
      };
    }

    return {
      ok: true as const,
      listing: engine.state.listings.get(existing.id) ?? next,
      errors: [] as string[],
      reused: true as const,
    };
  }

  return {
    ok: true as const,
    listing: existing,
    errors: [] as string[],
    reused: true as const,
  };
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
  saleMode?: "fixed" | "timed_window" | "english" | string | null;
  startingBidUsd?: number | null;
  reserveUsd?: number | null;
  collectionId?: string | null;
  isCollectionHero?: boolean;
  traits?: { trait_type: string; value: string }[];
  maxSupply?: number | null;
  publishSoftLaunch?: boolean;
  /** Secondary resale must copy origin media; skip anti-dupe for that path. */
  allowDuplicateMedia?: boolean;
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
    const cal = await validateDropWindow({
      type: input.type,
      startsAt,
      endsAt,
      excludeCollectionId: input.collectionId,
    });
    if (!cal.ok) {
      return { ok: false as const, errors: cal.errors };
    }
  }

  // Idempotent create/mint retry: same creator + exact media already in this
  // collection (draft or minted) — return that row instead of failing with
  // duplicate_media after a partial batch kept successful drafts.
  let skipDuplicateCheck = Boolean(input.allowDuplicateMedia);
  if (!input.allowDuplicateMedia) {
    const sameMedia = [...engine.state.listings.values()].filter(
      (l) => !l.delisted && l.mediaHash === mediaHash,
    );
    const foreign = sameMedia.find((l) => l.creatorId !== input.creatorId);
    if (foreign) {
      return {
        ok: false as const,
        errors: [`duplicate_media:${foreign.id}`],
      };
    }
    const ownCompatible = sameMedia.filter(
      (l) =>
        l.creatorId === input.creatorId &&
        (!input.collectionId ||
          !l.collectionId ||
          l.collectionId === input.collectionId),
    );
    const reusable =
      (input.collectionId
        ? ownCompatible.find((l) => l.collectionId === input.collectionId)
        : null) ??
      ownCompatible.find((l) => l.stage === "draft" && !l.collectionId) ??
      ownCompatible.find((l) => l.stage === "draft") ??
      ownCompatible[0];
    if (reusable) {
      return reuseDraftListingForCreate({
        engine,
        existing: reusable,
        input: {
          ...input,
          mediaHash,
          mediaUrl,
          chain,
          network,
        },
      });
    }
    // Same creator already used this media in another collection — allow a
    // new draft here; still block cross-creator copies via foreign check above.
    if (sameMedia.some((l) => l.creatorId === input.creatorId)) {
      skipDuplicateCheck = true;
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
    featuredBoostedAt: null,
    oeStartsAt: input.oeStartsAt ? new Date(input.oeStartsAt).getTime() : null,
    oeEndsAt: input.oeEndsAt ? new Date(input.oeEndsAt).getTime() : null,
    auctionStartsAt: input.auctionStartsAt
      ? new Date(input.auctionStartsAt).getTime()
      : null,
    auctionEndsAt: input.auctionEndsAt
      ? new Date(input.auctionEndsAt).getTime()
      : null,
    saleMode: (input.saleMode as string | undefined)
      ?? (input.type === "auction" ? "timed_window" : "fixed"),
    startingBidUsd: input.startingBidUsd ?? null,
    reserveUsd: input.reserveUsd ?? null,
    currentHighBidUsd: null,
    highBidderId: null,
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

  // Validate quality / rate limits. Duplicate media: block other creators;
  // own published copies are allowed only via allowDuplicateMedia (resale)
  // or when reusing / placing the same media in another collection.
  const validation = engine.createListing(draft, {
    skipDuplicateCheck,
  });
  if (!validation.ok) {
    const dupError = validation.errors.find((e) =>
      e.startsWith("duplicate_media:"),
    );
    if (dupError && !input.allowDuplicateMedia) {
      const matchedId = dupError.slice("duplicate_media:".length);
      const matched = engine.state.listings.get(matchedId);
      if (
        matched &&
        matched.creatorId === input.creatorId &&
        (!input.collectionId ||
          !matched.collectionId ||
          matched.collectionId === input.collectionId)
      ) {
        engine.state.listings.delete(draft.id);
        return reuseDraftListingForCreate({
          engine,
          existing: matched,
          input: {
            ...input,
            mediaHash,
            mediaUrl,
            chain,
            network,
          },
        });
      }
    }
    engine.state.listings.delete(draft.id);
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
      const staged = await transitionListingStage(id, "soft_launch");
      if (staged.ok) return staged;
      const draftListing = mem.state.listings.get(id);
      if (!draftListing) return staged;
      return {
        ok: true as const,
        listing: draftListing,
        errors: staged.errors,
        softLaunchBlocked: true as const,
      };
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
      saleMode: (input.saleMode as string | undefined)
        ?? (input.type === "auction" ? "timed_window" : "fixed"),
      startingBidUsd: input.startingBidUsd ?? null,
      reserveUsd: input.reserveUsd ?? null,
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
    const staged = await transitionListingStage(created.id, "soft_launch");
    if (staged.ok) return staged;
    return {
      ok: true as const,
      listing: toListing(created),
      errors: staged.errors,
      softLaunchBlocked: true as const,
    };
  }

  return { ok: true as const, listing: toListing(created), errors: [] as string[] };
}

export async function isCollectionSlugAvailable(
  slug: string,
  opts?: { excludeCollectionId?: string },
): Promise<boolean> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();

  if (mode === "memory" || isMemoryMode()) {
    const taken = [...getMemoryEngine().state.collections.values()].some(
      (c) =>
        c.slug === slug &&
        (!opts?.excludeCollectionId || c.id !== opts.excludeCollectionId),
    );
    return !taken;
  }

  const existing = await prisma.collection.findUnique({ where: { slug } });
  if (!existing) return true;
  if (opts?.excludeCollectionId && existing.id === opts.excludeCollectionId) {
    return true;
  }
  return false;
}

export async function isCollectionTitleAvailable(
  title: string,
  opts?: { excludeCollectionId?: string },
): Promise<boolean> {
  const { normalizeCollectionTitle } = await import(
    "@/lib/marketplace/collection-title"
  );
  const normalized = normalizeCollectionTitle(title);
  if (!normalized) return false;

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();

  if (mode === "memory" || isMemoryMode()) {
    const taken = [...getMemoryEngine().state.collections.values()].some(
      (c) =>
        normalizeCollectionTitle(c.title) === normalized &&
        (!opts?.excludeCollectionId || c.id !== opts.excludeCollectionId),
    );
    return !taken;
  }

  const existing = await prisma.collection.findUnique({
    where: { titleNormalized: normalized },
  });
  if (!existing) return true;
  if (opts?.excludeCollectionId && existing.id === opts.excludeCollectionId) {
    return true;
  }
  return false;
}

function uniqueConstraintTargets(err: unknown): string[] {
  if (!err || typeof err !== "object" || !("meta" in err)) return [];
  const meta = (err as { meta?: { target?: unknown } }).meta;
  if (!meta || !Array.isArray(meta.target)) return [];
  return meta.target.map(String);
}

export async function createCollectionForUser(input: {
  creatorId: string;
  title: string;
  slug: string;
  chain?: Chain;
  network?: NetworkId | string;
  creatorAddress?: string | null;
  description?: string;
  imageUrl?: string | null;
  bannerUrl?: string | null;
  websiteUrl?: string | null;
  twitterUrl?: string | null;
  discordUrl?: string | null;
  instagramUrl?: string | null;
}) {
  const { validateCollectionTitleFormat } = await import(
    "@/lib/marketplace/collection-title"
  );
  const titleCheck = validateCollectionTitleFormat(input.title);
  if (!titleCheck.ok) {
    return { ok: false as const, errors: [`invalid_title_${titleCheck.issue}`] };
  }
  const title = titleCheck.title;
  const titleNormalized = titleCheck.normalized;

  const { validateCollectionSlugFormat } = await import(
    "@/lib/marketplace/collection-slug"
  );
  const slugCheck = validateCollectionSlugFormat(input.slug);
  if (!slugCheck.ok) {
    return { ok: false as const, errors: [`invalid_slug_${slugCheck.issue}`] };
  }
  const slug = slugCheck.slug;

  const { validateCollectionProfileFields } = await import(
    "@/lib/marketplace/collection-profile"
  );
  const profileCheck = validateCollectionProfileFields({
    description: input.description ?? "",
    imageUrl: input.imageUrl,
    bannerUrl: input.bannerUrl,
    websiteUrl: input.websiteUrl,
    twitterUrl: input.twitterUrl,
    discordUrl: input.discordUrl,
    instagramUrl: input.instagramUrl,
  });
  if (!profileCheck.ok) {
    return { ok: false as const, errors: profileCheck.issues };
  }
  const profile = {
    description: profileCheck.data.description ?? "",
    imageUrl: profileCheck.data.imageUrl ?? null,
    bannerUrl: profileCheck.data.bannerUrl ?? null,
    websiteUrl: profileCheck.data.websiteUrl ?? null,
    twitterUrl: profileCheck.data.twitterUrl ?? null,
    discordUrl: profileCheck.data.discordUrl ?? null,
    instagramUrl: profileCheck.data.instagramUrl ?? null,
  };

  const network = resolveNetwork(input.network, input.chain);
  const chain = vmFromNetwork(network);
  const creatorAddress = input.creatorAddress?.trim() || "";

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();

  // Soft-holds from failed/cancelled wallet deploys must not permanently
  // consume a creator's own title/slug. Reclaim safe unconfirmed drafts first.
  await reclaimOwnUnconfirmedCollectionHold({
    creatorId: input.creatorId,
    title,
    slug,
  });

  const titleAvailable = await isCollectionTitleAvailable(title);
  if (!titleAvailable) {
    return { ok: false as const, errors: ["title_taken"] };
  }

  const available = await isCollectionSlugAvailable(slug);
  if (!available) {
    return { ok: false as const, errors: ["slug_taken"] };
  }

  // Opportunistic: free this creator's abandoned unconfirmed drafts (age gate).
  await cleanupAbandonedUnconfirmedCollections({
    creatorId: input.creatorId,
    maxAgeMs: ABANDONED_COLLECTION_HOLD_MAX_AGE_MS,
  });

  let collection: Collection;

  if (mode === "memory" || isMemoryMode()) {
    collection = {
      // Include entropy — two creates in the same millisecond must not collide.
      id: `col-mem-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
      title,
      slug,
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
      ...profile,
      contractAddress: null,
      linkedTokens: [],
      deployTxHash: null,
      deployStatus: "pending_wallet",
      nftTemplateVersion:
        chain === "boing" ? resolveBoingNftDeployTemplateVersion() : "1",
      escrowAddress: null,
      createdAt: Date.now(),
    };
    const mem = getMemoryEngine();
    mem.state.collections.set(collection.id, collection);
  } else {
    try {
      const created = await prisma.collection.create({
        data: {
          title,
          titleNormalized,
          slug,
          creatorId: input.creatorId,
          chain,
          network,
          deployStatus: "pending_wallet",
          nftTemplateVersion:
            chain === "boing" ? resolveBoingNftDeployTemplateVersion() : "1",
          ...profile,
        },
      });
      collection = toCollection(created);
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "";
      if (code === "P2002") {
        const targets = uniqueConstraintTargets(err);
        if (targets.some((t) => t.toLowerCase().includes("titlenormalized"))) {
          return { ok: false as const, errors: ["title_taken"] };
        }
        if (targets.some((t) => t.toLowerCase().includes("slug"))) {
          return { ok: false as const, errors: ["slug_taken"] };
        }
        // Ambiguous unique violation — prefer title when both were checked.
        return { ok: false as const, errors: ["title_taken"] };
      }
      throw err;
    }
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
      nftTemplateVersion: deployIntent.nftTemplateVersion,
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

export function isCollectionDeployReady(
  collection: Pick<
    Collection,
    "deployStatus" | "contractAddress" | "id" | "chain" | "network"
  >,
): boolean {
  if (collection.deployStatus !== "confirmed") return false;
  const addr = collection.contractAddress?.trim();
  if (!addr || addr.startsWith("pending:")) return false;
  const network = resolveNetwork(collection.network, collection.chain);
  if (network === "boing") {
    // Reject FreshMint sha256 placeholders that were never replaced with the
    // real nonce-derived Boing AccountId after wallet deploy.
    if (isProvisionalBoingCollectionAddress(collection.id, addr)) return false;
  }
  return true;
}

/** Soft-hold drafts older than this are safe to purge when never deployed. */
export const ABANDONED_COLLECTION_HOLD_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function listingBlocksCollectionRelease(listing: Listing): boolean {
  if (listing.delisted) return false;
  if (listing.mintTxHash?.trim()) return true;
  if (listing.tokenId?.trim()) return true;
  if (listing.stage !== "draft") return true;
  if (listing.softLaunchedAt) return true;
  return false;
}

/**
 * True when a collection row is only a soft name/slug hold (no confirmed
 * on-chain contract, no minted/live listings). Safe to delete to free uniqueness.
 */
export function isReleasableCollectionNameHold(
  collection: Pick<
    Collection,
    "deployStatus" | "contractAddress" | "id" | "chain" | "network"
  >,
  listings: Listing[],
): boolean {
  if (isCollectionDeployReady(collection)) return false;
  if (listings.some(listingBlocksCollectionRelease)) return false;
  return true;
}

/** Prefer in-memory engine when tests (or fallback) enabled memory mode. */
async function engineForCollectionHold(): Promise<DiscoveryEngine> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    return getMemoryEngine();
  }
  return getDiscoveryEngine();
}

async function collectionHoldStorageMode(): Promise<{
  useMemory: boolean;
  engine: DiscoveryEngine;
}> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();
  const useMemory = mode === "memory" || isMemoryMode();
  return {
    useMemory,
    engine: useMemory ? getMemoryEngine() : await getDiscoveryEngine(),
  };
}

/** Stamp that frees unique titleNormalized + slug without colliding. */
function releasedUniquenessStamp(collectionId: string) {
  const stamp = `released-${collectionId}`;
  return {
    title: stamp.slice(0, 120),
    titleNormalized: stamp.toLowerCase(),
    slug: stamp.slice(0, 64),
  };
}

/**
 * Free unique titleNormalized + slug on an unconfirmed draft when a full
 * delete is not possible (FK edge cases). Row is marked failed.
 */
async function freeCollectionUniquenessKeys(input: {
  collectionId: string;
  useMemory: boolean;
  engine: DiscoveryEngine;
}) {
  const stamp = releasedUniquenessStamp(input.collectionId);
  const existing = input.engine.state.collections.get(input.collectionId);
  if (input.useMemory) {
    if (!existing) return;
    input.engine.state.collections.set(input.collectionId, {
      ...existing,
      title: stamp.title,
      slug: stamp.slug,
      deployStatus: "failed",
      contractAddress: null,
      deployTxHash: null,
    });
    return;
  }
  await prisma.collection.update({
    where: { id: input.collectionId },
    data: {
      title: stamp.title,
      titleNormalized: stamp.titleNormalized,
      slug: stamp.slug,
      deployStatus: "failed",
      contractAddress: null,
      deployTxHash: null,
    },
  });
  if (existing) {
    input.engine.state.collections.set(input.collectionId, {
      ...existing,
      title: stamp.title,
      slug: stamp.slug,
      deployStatus: "failed",
      contractAddress: null,
      deployTxHash: null,
    });
  } else {
    input.engine.state.collections.delete(input.collectionId);
  }
}

/**
 * Release a soft-held collection name/slug after failed, cancelled, or
 * never-confirmed on-chain deploy. Deletes the draft row (+ unminted draft
 * listings) so `titleNormalized` / `slug` can be reused. Falls back to
 * renaming uniqueness keys if delete cannot complete.
 */
export async function releaseCollectionNameHold(input: {
  collectionId: string;
  creatorId: string;
  /** When set, only release if the collection is at least this old. */
  minAgeMs?: number;
}) {
  const { useMemory, engine } = await collectionHoldStorageMode();
  let collection = engine.state.collections.get(input.collectionId) ?? null;

  // Prisma is source of truth for unique slug/titleNormalized — engine can lag.
  if (!collection && !useMemory) {
    const row = await prisma.collection.findUnique({
      where: { id: input.collectionId },
    });
    if (row) collection = toCollection(row);
  }
  if (!collection) return { ok: false as const, error: "collection_not_found" };
  if (collection.creatorId !== input.creatorId) {
    return { ok: false as const, error: "collection_forbidden" };
  }

  if (typeof input.minAgeMs === "number" && input.minAgeMs > 0) {
    const createdAt = collection.createdAt ?? 0;
    if (!createdAt || Date.now() - createdAt < input.minAgeMs) {
      return { ok: false as const, error: "collection_hold_too_recent" };
    }
  }

  let listings = [...engine.state.listings.values()].filter(
    (l) => l.collectionId === input.collectionId,
  );
  if (!useMemory) {
    const dbListings = await prisma.listing.findMany({
      where: { collectionId: input.collectionId },
    });
    if (dbListings.length) {
      listings = dbListings.map(toListing);
    }
  }
  if (!isReleasableCollectionNameHold(collection, listings)) {
    return { ok: false as const, error: "collection_hold_not_releasable" };
  }

  const listingIds = listings.map((l) => l.id);

  if (useMemory) {
    for (const id of listingIds) {
      engine.state.listings.delete(id);
    }
    engine.state.collections.delete(input.collectionId);
    return {
      ok: true as const,
      releasedCollectionId: input.collectionId,
      releasedListingIds: listingIds,
      mode: "deleted" as const,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (listingIds.length) {
        // Draft-only children — clear FKs so listings + collection can go.
        await tx.shelfItem.deleteMany({
          where: { listingId: { in: listingIds } },
        });
        await tx.signalEvent.deleteMany({
          where: { listingId: { in: listingIds } },
        });
        await tx.nomination.deleteMany({
          where: { listingId: { in: listingIds } },
        });
        await tx.report.deleteMany({
          where: { listingId: { in: listingIds } },
        });
        await tx.appeal.deleteMany({
          where: { listingId: { in: listingIds } },
        });
        await tx.bid.deleteMany({
          where: { listingId: { in: listingIds } },
        });
        await tx.offer.deleteMany({
          where: { listingId: { in: listingIds } },
        });
        await tx.purchase.deleteMany({
          where: { listingId: { in: listingIds } },
        });
        await tx.listing.deleteMany({
          where: { id: { in: listingIds }, collectionId: input.collectionId },
        });
      }
      // packagePurchase cascades from Collection.
      await tx.collection.delete({ where: { id: input.collectionId } });
    });
    for (const id of listingIds) {
      engine.state.listings.delete(id);
    }
    engine.state.collections.delete(input.collectionId);
    return {
      ok: true as const,
      releasedCollectionId: input.collectionId,
      releasedListingIds: listingIds,
      mode: "deleted" as const,
    };
  } catch (err) {
    // Still free unique URL + name so create/retry is not blocked.
    console.warn(
      "[freshmint] collection hold delete failed; freeing uniqueness keys",
      input.collectionId,
      err instanceof Error ? err.message : err,
    );
    await freeCollectionUniquenessKeys({
      collectionId: input.collectionId,
      useMemory: false,
      engine,
    });
    return {
      ok: true as const,
      releasedCollectionId: input.collectionId,
      releasedListingIds: listingIds,
      mode: "keys_freed" as const,
    };
  }
}

/**
 * If this creator already soft-holds `title` and/or `slug` with an unconfirmed
 * draft, release that hold so create/retry can proceed.
 *
 * Looks up by Prisma unique columns (slug / titleNormalized) first — the
 * discovery engine alone can miss a stuck draft that still blocks the URL.
 */
export async function reclaimOwnUnconfirmedCollectionHold(input: {
  creatorId: string;
  title?: string | null;
  slug?: string | null;
}) {
  const { normalizeCollectionTitle } = await import(
    "@/lib/marketplace/collection-title"
  );
  const { normalizeCollectionSlug } = await import(
    "@/lib/marketplace/collection-slug"
  );
  const { useMemory, engine } = await collectionHoldStorageMode();
  const wantTitle = input.title?.trim()
    ? normalizeCollectionTitle(input.title)
    : null;
  const wantSlug = input.slug?.trim()
    ? normalizeCollectionSlug(input.slug)
    : null;
  if (!wantTitle && !wantSlug) {
    return { ok: true as const, released: [] as string[] };
  }

  const candidateIds = new Set<string>();

  for (const c of engine.state.collections.values()) {
    if (c.creatorId !== input.creatorId) continue;
    const titleMatch =
      wantTitle && normalizeCollectionTitle(c.title) === wantTitle;
    const slugMatch =
      wantSlug && (c.slug || "").toLowerCase() === wantSlug.toLowerCase();
    if (titleMatch || slugMatch) candidateIds.add(c.id);
  }

  // Source of truth for unique constraints — find holders even if engine lagged.
  if (!useMemory) {
    if (wantTitle) {
      const byTitle = await prisma.collection.findUnique({
        where: { titleNormalized: wantTitle },
      });
      if (byTitle && byTitle.creatorId === input.creatorId) {
        candidateIds.add(byTitle.id);
      }
    }
    if (wantSlug) {
      const bySlug = await prisma.collection.findUnique({
        where: { slug: wantSlug },
      });
      if (bySlug && bySlug.creatorId === input.creatorId) {
        candidateIds.add(bySlug.id);
      }
    }
  }

  const released: string[] = [];
  for (const id of candidateIds) {
    const result = await releaseCollectionNameHold({
      collectionId: id,
      creatorId: input.creatorId,
    });
    if (result.ok) released.push(id);
  }
  return { ok: true as const, released };
}

/**
 * Delete abandoned unpublished collection drafts that never got a real
 * on-chain contract (frees unique title/slug). Scoped to one creator when set.
 */
export async function cleanupAbandonedUnconfirmedCollections(input?: {
  creatorId?: string;
  maxAgeMs?: number;
  limit?: number;
}) {
  const maxAgeMs = input?.maxAgeMs ?? ABANDONED_COLLECTION_HOLD_MAX_AGE_MS;
  const limit = input?.limit ?? 50;
  const { useMemory, engine } = await collectionHoldStorageMode();
  const now = Date.now();
  const cutoff = now - maxAgeMs;
  const candidateIds = new Set<string>();
  const creatorById = new Map<string, string>();

  for (const c of engine.state.collections.values()) {
    if (input?.creatorId && c.creatorId !== input.creatorId) continue;
    if (isCollectionDeployReady(c)) continue;
    const createdAt = c.createdAt ?? 0;
    if (!createdAt || createdAt > cutoff) continue;
    candidateIds.add(c.id);
    creatorById.set(c.id, c.creatorId);
  }

  // Also scan Prisma so stuck slugs not present in a stale engine are freed.
  if (!useMemory) {
    const rows = await prisma.collection.findMany({
      where: {
        ...(input?.creatorId ? { creatorId: input.creatorId } : {}),
        deployStatus: { in: ["pending_wallet", "failed", "none"] },
        createdAt: { lt: new Date(cutoff) },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: {
        id: true,
        creatorId: true,
        contractAddress: true,
        deployStatus: true,
        chain: true,
        network: true,
      },
    });
    for (const row of rows) {
      if (
        isCollectionDeployReady({
          id: row.id,
          deployStatus: row.deployStatus,
          contractAddress: row.contractAddress,
          chain: row.chain as Collection["chain"],
          network: row.network,
        })
      ) {
        continue;
      }
      candidateIds.add(row.id);
      creatorById.set(row.id, row.creatorId);
    }
  }

  const ordered = [...candidateIds]
    .map((id) => {
      const fromEngine = engine.state.collections.get(id);
      return {
        id,
        creatorId: creatorById.get(id) || fromEngine?.creatorId || "",
        createdAt: fromEngine?.createdAt ?? 0,
      };
    })
    .filter((c) => c.creatorId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, limit);

  const released: string[] = [];
  for (const c of ordered) {
    const result = await releaseCollectionNameHold({
      collectionId: c.id,
      creatorId: c.creatorId,
      minAgeMs: maxAgeMs,
    });
    if (result.ok) released.push(c.id);
  }
  return { ok: true as const, released, scanned: ordered.length };
}

export async function confirmCollectionDeploy(input: {
  collectionId: string;
  creatorId: string;
  txHash: string;
  contractAddress?: string | null;
  escrowAddress?: string | null;
  creatorAddress?: string | null;
  /** Boing template version used for this deploy (`"1"` | `"2"` | `"3"`). */
  nftTemplateVersion?: string | null;
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

  let contractAddress =
    input.contractAddress?.trim() ||
    existing.contractAddress ||
    `pending:${input.collectionId}`;
  const escrowAddress =
    input.escrowAddress?.trim() ||
    existing.escrowAddress ||
    null;

  const network = resolveNetwork(existing.network, existing.chain);
  let nftTemplateVersion =
    existing.nftTemplateVersion?.trim() ||
    input.nftTemplateVersion?.trim() ||
    "1";

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  const memory = mode === "memory" || isMemoryMode();

  if (network === "boing") {
    const {
      isProvisionalBoingCollectionAddress,
      normalizeBoingNftTemplateVersion,
      probeBoingNftCollection,
      resolveBoingDeployContractAddress,
      waitForBoingDeployedContract,
    } = await import("@/lib/onchain/boing");
    const creatorAddress =
      input.creatorAddress?.trim() ||
      engine.state.creators
        .get(input.creatorId)
        ?.wallets.find((w) => w.chain === "boing")?.address ||
      "";

    if (
      isProvisionalBoingCollectionAddress(input.collectionId, contractAddress)
    ) {
      const resolved = await resolveBoingDeployContractAddress({
        creatorAddress,
        collectionId: input.collectionId,
        fallbackAddress: contractAddress,
        assetName: existing.title.trim().slice(0, 32),
      });
      if (resolved) contractAddress = resolved;
    }

    // Live chains: never confirm a placeholder / unverified AccountId.
    // Memory/unit tests skip the on-chain wait.
    if (!memory) {
      if (
        isProvisionalBoingCollectionAddress(input.collectionId, contractAddress) ||
        !creatorAddress
      ) {
        if (creatorAddress) {
          const waited = await waitForBoingDeployedContract({
            creatorAddress,
            assetName: existing.title.trim().slice(0, 32),
            preferredAddress: isProvisionalBoingCollectionAddress(
              input.collectionId,
              contractAddress,
            )
              ? null
              : contractAddress,
            timeoutMs: 45_000,
            intervalMs: 1_500,
          });
          if (waited.ok) {
            contractAddress = waited.contractAddress;
          } else {
            return { ok: false as const, error: waited.error };
          }
        } else {
          return { ok: false as const, error: "boing_account_id_required" };
        }
      } else {
        let probe = await probeBoingNftCollection(contractAddress);
        if (probe === "unknown") {
          probe = await probeBoingNftCollection(contractAddress);
        }
        if (probe !== "exists") {
          const waited = await waitForBoingDeployedContract({
            creatorAddress,
            assetName: existing.title.trim().slice(0, 32),
            preferredAddress: contractAddress,
            timeoutMs: 45_000,
            intervalMs: 1_500,
          });
          if (!waited.ok) {
            return {
              ok: false as const,
              error:
                probe === "missing"
                  ? "boing_collection_account_missing"
                  : waited.error,
            };
          }
          contractAddress = waited.contractAddress;
        }
      }
    }

    if (
      isProvisionalBoingCollectionAddress(input.collectionId, contractAddress)
    ) {
      return { ok: false as const, error: "boing_contract_unresolved" };
    }
    // Stamp deploy-time template: explicit input, else what new deploys use now,
    // else keep existing (defaults to v1 for legacy rows).
    nftTemplateVersion = normalizeBoingNftTemplateVersion(
      input.nftTemplateVersion ??
        existing.nftTemplateVersion ??
        "1",
    );
  }

  const next: Collection = {
    ...existing,
    contractAddress,
    deployTxHash: input.txHash,
    deployStatus: "confirmed",
    nftTemplateVersion,
    escrowAddress,
  };

  if (memory) {
    getMemoryEngine().state.collections.set(input.collectionId, next);
    return { ok: true as const, collection: next };
  }

  const updated = await prisma.collection.update({
    where: { id: input.collectionId },
    data: {
      contractAddress,
      deployTxHash: input.txHash,
      deployStatus: "confirmed",
      nftTemplateVersion,
      escrowAddress,
    },
  });
  const mapped = toCollection(updated);
  engine.state.collections.set(input.collectionId, mapped);
  return { ok: true as const, collection: mapped };
}

/** Re-issue a deploy wallet intent for a collection that never reached confirmed. */
export async function prepareCollectionDeployForUser(input: {
  collectionId: string;
  creatorId: string;
  creatorAddress?: string | null;
  /**
   * When true on Boing: if the stored contract AccountId is missing on-chain,
   * clear the fake "confirmed" deploy and return a fresh wallet deploy intent.
   */
  forceRedeploy?: boolean;
}) {
  const engine = await getDiscoveryEngine();
  let collection = engine.state.collections.get(input.collectionId);
  if (!collection) return { ok: false as const, error: "collection_not_found" };
  if (collection.creatorId !== input.creatorId) {
    return { ok: false as const, error: "collection_forbidden" };
  }

  const network = resolveNetwork(collection.network, collection.chain);
  const chain = vmFromNetwork(network);
  const creatorAddress =
    input.creatorAddress?.trim() ||
    engine.state.creators
      .get(input.creatorId)
      ?.wallets.find((w) => w.chain === chain)?.address ||
    "";

  if (isCollectionDeployReady(collection)) {
    if (input.forceRedeploy && network === "boing" && collection.contractAddress) {
      const { probeBoingNftCollection, normalizeBoingAccountId } = await import(
        "@/lib/onchain/boing"
      );
      let probe = await probeBoingNftCollection(
        normalizeBoingAccountId(collection.contractAddress),
      );
      if (probe === "unknown") {
        probe = await probeBoingNftCollection(
          normalizeBoingAccountId(collection.contractAddress),
        );
      }
      if (probe === "exists") {
        return {
          ok: true as const,
          collection,
          deployIntent: null,
          alreadyDeployed: true as const,
        };
      }
      // RPC hiccup — do not wipe a possibly-good deploy.
      if (probe === "unknown") {
        return { ok: false as const, error: "boing_account_probe_unknown" };
      }
      // Dead AccountId marked confirmed — clear so we can re-deploy.
      const cleared = await clearCollectionDeployState({
        collectionId: collection.id,
        creatorId: input.creatorId,
      });
      if (!cleared.ok) return cleared;
      collection = cleared.collection;
    } else {
      return {
        ok: true as const,
        collection,
        deployIntent: null,
        alreadyDeployed: true as const,
      };
    }
  }

  const { buildCollectionDeployIntent } = await import("@/lib/onchain/collection");
  const deployIntent = buildCollectionDeployIntent({
    collectionId: collection.id,
    title: collection.title,
    creatorAddress,
    network,
    chain,
  });

  const nftTemplateVersion =
    deployIntent.nftTemplateVersion ?? collection.nftTemplateVersion ?? "1";
  let stored = collection;

  if (nftTemplateVersion !== collection.nftTemplateVersion) {
    const { ensureDatabaseReady } = await import("@/lib/db-ready");
    const { isMemoryMode, getMemoryEngine } = await import("@/lib/data/memory-store");
    const mode = await ensureDatabaseReady();
    stored = { ...collection, nftTemplateVersion };
    if (mode === "memory" || isMemoryMode()) {
      getMemoryEngine().state.collections.set(collection.id, stored);
    } else {
      await prisma.collection.update({
        where: { id: collection.id },
        data: { nftTemplateVersion },
      });
      engine.state.collections.set(collection.id, stored);
    }
  }

  return {
    ok: true as const,
    collection: {
      ...stored,
      deployStatus: "pending_wallet" as const,
      escrowAddress: deployIntent.escrowAddress,
      nftTemplateVersion,
    },
    deployIntent,
    alreadyDeployed: false as const,
  };
}

/** Clear a falsely confirmed deploy so the owner can wallet-deploy again. */
async function clearCollectionDeployState(input: {
  collectionId: string;
  creatorId: string;
}) {
  const engine = await getDiscoveryEngine();
  const existing = engine.state.collections.get(input.collectionId);
  if (!existing) return { ok: false as const, error: "collection_not_found" };
  if (existing.creatorId !== input.creatorId) {
    return { ok: false as const, error: "collection_forbidden" };
  }

  const { provisionalBoingCollectionAddress } = await import("@/lib/onchain/boing");
  const network = resolveNetwork(existing.network, existing.chain);
  const next: Collection = {
    ...existing,
    deployStatus: "pending_wallet",
    deployTxHash: null,
    contractAddress:
      network === "boing"
        ? provisionalBoingCollectionAddress(existing.id)
        : null,
  };

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    getMemoryEngine().state.collections.set(existing.id, next);
  } else {
    await prisma.collection.update({
      where: { id: existing.id },
      data: {
        deployStatus: "pending_wallet",
        deployTxHash: null,
        contractAddress: next.contractAddress,
      },
    });
    engine.state.collections.set(existing.id, next);
  }
  return { ok: true as const, collection: next };
}

/**
 * Heal false "not deployed" when the collection already exists on-chain
 * (wallet succeeded but DB confirm never ran / stored a provisional address).
 */
export async function syncCollectionDeployFromChain(input: {
  collectionId: string;
  creatorId: string;
  creatorAddress?: string | null;
  contractAddress?: string | null;
  txHash?: string | null;
}) {
  const engine = await getDiscoveryEngine();
  const collection = engine.state.collections.get(input.collectionId);
  if (!collection) return { ok: false as const, error: "collection_not_found" };
  if (collection.creatorId !== input.creatorId) {
    return { ok: false as const, error: "collection_forbidden" };
  }

  const network = resolveNetwork(collection.network, collection.chain);
  const chain = vmFromNetwork(network);
  const creatorAddress =
    input.creatorAddress?.trim() ||
    engine.state.creators
      .get(input.creatorId)
      ?.wallets.find((w) => w.chain === chain)?.address ||
    "";

  // Confirmed in DB but AccountId gone / never on-chain — try heal, else signal redeploy.
  if (isCollectionDeployReady(collection) && network === "boing") {
    const {
      normalizeBoingAccountId,
      probeBoingNftCollection,
      resolveBoingDeployContractAddress,
    } = await import("@/lib/onchain/boing");
    const stored = normalizeBoingAccountId(collection.contractAddress!);
    let probe = await probeBoingNftCollection(stored);
    if (probe === "unknown") probe = await probeBoingNftCollection(stored);
    if (probe === "exists") {
      return { ok: true as const, collection, synced: false as const };
    }
    if (probe === "unknown") {
      return { ok: false as const, error: "boing_account_probe_unknown" };
    }
    if (creatorAddress) {
      const healedRaw = await resolveBoingDeployContractAddress({
        creatorAddress,
        collectionId: collection.id,
        assetName: collection.title.trim().slice(0, 32),
        fallbackAddress: stored,
      });
      if (healedRaw) {
        const healed = normalizeBoingAccountId(healedRaw);
        let healedProbe = await probeBoingNftCollection(healed);
        if (healedProbe === "unknown") {
          healedProbe = await probeBoingNftCollection(healed);
        }
        if (healedProbe === "exists") {
          const syncTxHash = `0x${createHash("sha256")
            .update(`boing-sync:${collection.id}:${healed}`)
            .digest("hex")}`;
          const confirmed = await confirmCollectionDeploy({
            collectionId: input.collectionId,
            creatorId: input.creatorId,
            txHash: syncTxHash,
            contractAddress: healed,
            escrowAddress: collection.escrowAddress,
            creatorAddress,
            nftTemplateVersion: collection.nftTemplateVersion,
          });
          if (confirmed.ok) {
            return {
              ok: true as const,
              collection: confirmed.collection,
              synced: true as const,
            };
          }
        }
      }
    }
    return { ok: false as const, error: "boing_collection_account_missing" };
  }

  if (isCollectionDeployReady(collection)) {
    return { ok: true as const, collection, synced: false as const };
  }

  let contractAddress = input.contractAddress?.trim() || null;
  let txHash = input.txHash?.trim() || collection.deployTxHash || null;

  if (network === "boing") {
    const {
      findBoingNftCollectionDeploy,
      isBoingNativeAccountIdHex,
      isProvisionalBoingCollectionAddress,
      normalizeBoingAccountId,
      resolveBoingDeployContractAddress,
    } = await import("@/lib/onchain/boing");

    if (
      contractAddress &&
      isBoingNativeAccountIdHex(contractAddress) &&
      !isProvisionalBoingCollectionAddress(collection.id, contractAddress)
    ) {
      contractAddress = normalizeBoingAccountId(contractAddress);
    } else {
      contractAddress = null;
    }

    if (!contractAddress && creatorAddress) {
      const found = await findBoingNftCollectionDeploy({
        senderAddress: creatorAddress,
        assetName: collection.title.trim().slice(0, 32),
        lookbackBlocks: 256,
      });
      if (found) {
        contractAddress = found.contractAddress;
        // Prefer a stable sync id over wallet mempool placeholders (`ok` / pending:).
        if (!txHash || txHash.startsWith("pending:")) {
          txHash = `0x${createHash("sha256")
            .update(
              `boing-sync:${collection.id}:${found.contractAddress}:${found.blockHeight}`,
            )
            .digest("hex")}`;
        }
      } else {
        const resolved = await resolveBoingDeployContractAddress({
          creatorAddress,
          collectionId: collection.id,
          fallbackAddress: collection.contractAddress,
          assetName: collection.title.trim().slice(0, 32),
        });
        // Only accept nonce-derived guess when caller supplies evidence of a
        // recent wallet submit (real hash or mempool-accepted pending marker).
        // Blind guesses risk linking the wrong deploy.
        if (resolved && input.txHash) {
          contractAddress = resolved;
          if (!txHash || txHash.startsWith("pending:")) {
            txHash = `0x${createHash("sha256")
              .update(
                `boing-sync:${collection.id}:${resolved}:nonce-derived`,
              )
              .digest("hex")}`;
          }
        }
      }
    }
  } else if (!contractAddress) {
    contractAddress = collection.contractAddress ?? null;
  }

  if (!contractAddress || !txHash) {
    return { ok: false as const, error: "onchain_deploy_not_found" };
  }

  // Replace wallet mempool placeholders with a stable FreshMint sync id.
  if (txHash.startsWith("pending:")) {
    txHash = `0x${createHash("sha256")
      .update(`boing-sync:${collection.id}:${contractAddress}`)
      .digest("hex")}`;
  }

  return confirmCollectionDeploy({
    collectionId: input.collectionId,
    creatorId: input.creatorId,
    txHash,
    contractAddress,
    escrowAddress: collection.escrowAddress,
    creatorAddress,
  }).then((result) =>
    result.ok
      ? { ok: true as const, collection: result.collection, synced: true as const }
      : result,
  );
}

export async function prepareCollectionPublishMints(input: {
  collectionId: string;
  creatorId: string;
  listingIds: string[];
  creatorAddress?: string | null;
}) {
  const engine = await getDiscoveryEngine();
  let collection = engine.state.collections.get(input.collectionId);
  if (!collection) return { ok: false as const, error: "collection_not_found" };
  if (collection.creatorId !== input.creatorId) {
    return { ok: false as const, error: "collection_forbidden" };
  }

  const network = resolveNetwork(collection.network, collection.chain);
  const creator =
    input.creatorAddress?.trim() ||
    engine.state.creators
      .get(input.creatorId)
      ?.wallets.find((w) => w.chain === collection!.chain)?.address ||
    "";

  // Heal Boing provisional / pending deploy before building mint batches.
  if (!isCollectionDeployReady(collection) && network === "boing") {
    const synced = await syncCollectionDeployFromChain({
      collectionId: input.collectionId,
      creatorId: input.creatorId,
      creatorAddress: creator || null,
    });
    if (synced.ok && synced.collection) {
      collection = synced.collection;
      engine.state.collections.set(input.collectionId, synced.collection);
    }
  }

  if (!isCollectionDeployReady(collection)) {
    return { ok: false as const, error: "collection_not_deployed" };
  }

  if (network === "boing") {
    const {
      isBoingNativeAccountIdHex,
      normalizeBoingAccountId,
      probeBoingAccount,
      probeBoingNftCollection,
      resolveBoingDeployContractAddress,
    } = await import("@/lib/onchain/boing");
    if (!isBoingNativeAccountIdHex(creator)) {
      return { ok: false as const, error: "boing_account_id_required" };
    }

    async function probeContract(
      accountId: string,
    ): Promise<"exists" | "missing" | "unknown"> {
      let probe = await probeBoingNftCollection(accountId);
      if (probe === "unknown") {
        probe = await probeBoingNftCollection(accountId);
      }
      return probe;
    }

    async function probeCreator(
      accountId: string,
    ): Promise<"exists" | "missing" | "unknown"> {
      let probe = await probeBoingAccount(accountId);
      if (probe === "unknown") {
        probe = await probeBoingAccount(accountId);
      }
      return probe;
    }

    let contract = normalizeBoingAccountId(collection.contractAddress!);
    let contractProbe = await probeContract(contract);

    // DB may say deploy-ready while the stored AccountId is wrong/dead — heal.
    if (contractProbe !== "exists" && creator) {
      const healedRaw = await resolveBoingDeployContractAddress({
        creatorAddress: creator,
        collectionId: collection.id,
        assetName: collection.title.trim().slice(0, 32),
        fallbackAddress: contract,
      });
      if (healedRaw) {
        const healed = normalizeBoingAccountId(healedRaw);
        let healedProbe = await probeContract(healed);
        if (healedProbe === "exists") {
          const syncTxHash = `0x${createHash("sha256")
            .update(`boing-sync:${collection.id}:${healed}`)
            .digest("hex")}`;
          const confirmed = await confirmCollectionDeploy({
            collectionId: input.collectionId,
            creatorId: input.creatorId,
            txHash: syncTxHash,
            contractAddress: healed,
            escrowAddress: collection.escrowAddress,
            creatorAddress: creator,
            nftTemplateVersion: collection.nftTemplateVersion,
          });
          if (confirmed.ok) {
            collection = confirmed.collection;
            engine.state.collections.set(input.collectionId, confirmed.collection);
            contract = normalizeBoingAccountId(collection.contractAddress!);
            contractProbe = await probeContract(contract);
          }
        }
      }
    }

    if (contractProbe === "missing") {
      return { ok: false as const, error: "boing_collection_account_missing" };
    }
    if (contractProbe !== "exists") {
      return { ok: false as const, error: "boing_account_probe_unknown" };
    }

    const creatorProbe = await probeCreator(normalizeBoingAccountId(creator));
    if (creatorProbe === "missing") {
      return { ok: false as const, error: "boing_creator_account_missing" };
    }
    if (creatorProbe !== "exists") {
      return { ok: false as const, error: "boing_account_probe_unknown" };
    }
  }

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
  const batches = buildCollectionMintBatches({
    network,
    chain: collection.chain,
    contractAddress: collection.contractAddress ?? "",
    creatorAddress: creator,
    escrowAddress: collection.escrowAddress || creator,
    items,
    startingTokenId: 1,
    // Existing Boing collections (incl. Baked Nation) stay v1 → one mint / tx.
    nftTemplateVersion: collection.nftTemplateVersion ?? "1",
    collectionTitle: collection.title,
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
  if (!isCollectionDeployReady(collection)) {
    return { ok: false as const, error: "collection_not_deployed" };
  }

  const network = resolveNetwork(collection.network, collection.chain);
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  const memory = mode === "memory" || isMemoryMode();

  let mintTxHash = input.txHash;
  const tokenIds = input.tokenIds ?? [];
  const contractAddress =
    input.contractAddress?.trim() || collection.contractAddress || null;
  /** True after mempool-ok path already verified token owners on-chain. */
  let boingOwnershipVerified = false;

  if (network === "boing") {
    const {
      isBoingMempoolPlaceholderTxId,
      isProvisionalBoingCollectionAddress,
      waitForBoingNftTokensMinted,
      waitForBoingTransactionReceipt,
    } = await import("@/lib/onchain/boing");
    if (
      !contractAddress ||
      isProvisionalBoingCollectionAddress(collection.id, contractAddress)
    ) {
      return { ok: false as const, error: "boing_collection_account_missing" };
    }

    if (mintTxHash.startsWith("simulated-mint:")) {
      if (!memory) {
        return { ok: false as const, error: "simulated_mint_not_allowed" };
      }
    } else if (isBoingMempoolPlaceholderTxId(mintTxHash)) {
      // Wallet returned mempool `"ok"` — wait for tokens on-chain, then stamp
      // a stable sync hash (pending: markers are not gallery-visible).
      const provisionalTokenIds =
        tokenIds.length > 0
          ? tokenIds
          : input.listingIds.map((id, i) => {
              const listing = engine.state.listings.get(id);
              return listing?.tokenId ?? String(i + 1);
            });
      const minted = await waitForBoingNftTokensMinted({
        collection: contractAddress,
        tokenIds: provisionalTokenIds,
        timeoutMs: 90_000,
        intervalMs: 1_500,
      });
      if (!minted.ok) {
        return { ok: false as const, error: minted.error };
      }
      boingOwnershipVerified = true;
      mintTxHash = `0x${createHash("sha256")
        .update(
          `boing-mint-sync:${collection.id}:${contractAddress}:${provisionalTokenIds.join(",")}`,
        )
        .digest("hex")}`;
    } else {
      const receipt = await waitForBoingTransactionReceipt(mintTxHash, {
        timeoutMs: 45_000,
        intervalMs: 1_200,
      });
      if (!receipt.ok) {
        return { ok: false as const, error: receipt.error };
      }
    }
  } else if (mintTxHash.startsWith("simulated-mint:") && !memory) {
    return { ok: false as const, error: "simulated_mint_not_allowed" };
  }

  const mintedDraftIds: string[] = [];
  const skippedUnverified: Array<{ listingId: string; error: string }> = [];

  for (let i = 0; i < input.listingIds.length; i++) {
    const listingId = input.listingIds[i]!;
    const listing = engine.state.listings.get(listingId);
    if (!listing || listing.collectionId !== input.collectionId) continue;
    const tokenId = tokenIds[i] ?? listing.tokenId ?? String(i + 1);

    // Post-receipt safeguard: Boing token must resolve an owner on-chain
    // before we stamp mint fields / soft-launch (skip when RPC unknown).
    // Mempool-ok path already waited for ownership above.
    if (
      network === "boing" &&
      !memory &&
      !boingOwnershipVerified &&
      !mintTxHash.startsWith("simulated-mint:")
    ) {
      const { getBoingNftOwner } = await import("@/lib/onchain/boing");
      const ownerProbe = await getBoingNftOwner({
        collection: contractAddress!,
        tokenId,
      });
      if (ownerProbe.ok && !ownerProbe.owner) {
        skippedUnverified.push({
          listingId,
          error: "boing_token_not_on_chain",
        });
        continue;
      }
      // If probe failed (RPC), still allow confirm after receipt — receipt is
      // the primary on-chain proof; owner read is best-effort.
    }

    const next = {
      ...listing,
      mintTxHash,
      tokenId,
      contractAddress: contractAddress ?? listing.contractAddress,
    };
    if (memory) {
      getMemoryEngine().state.listings.set(listingId, next);
    } else {
      await prisma.listing.update({
        where: { id: listingId },
        data: {
          mintTxHash,
          tokenId,
          ...(contractAddress ? { contractAddress } : {}),
        },
      });
      engine.state.listings.set(listingId, next);
    }
    if (next.stage === "draft") mintedDraftIds.push(listingId);
  }

  if (mintedDraftIds.length === 0 && skippedUnverified.length > 0) {
    return {
      ok: false as const,
      error: "boing_token_not_on_chain",
      skippedUnverified,
    };
  }

  // Publish each minted piece immediately so a mid-wizard failure cannot
  // leave buyable inventory stuck as private drafts (profile-only).
  const softLaunched: string[] = [];
  const softLaunchErrors: Array<{ listingId: string; errors: string[] }> = [];
  for (const listingId of mintedDraftIds) {
    const staged = engine.transitionListing(listingId, "soft_launch");
    if (!staged.ok || !staged.listing) {
      softLaunchErrors.push({
        listingId,
        errors: staged.errors,
      });
      continue;
    }
    softLaunched.push(listingId);
    if (!memory) {
      await prisma.listing.update({
        where: { id: listingId },
        data: {
          stage: staged.listing.stage,
          softLaunchedAt: staged.listing.softLaunchedAt
            ? new Date(staged.listing.softLaunchedAt)
            : null,
          risingEligibleAt: staged.listing.risingEligibleAt
            ? new Date(staged.listing.risingEligibleAt)
            : null,
          featuredAt: staged.listing.featuredAt
            ? new Date(staged.listing.featuredAt)
            : null,
        },
      });
      const creator = engine.state.creators.get(staged.listing.creatorId);
      if (creator) {
        await persistCreatorStats(staged.listing.creatorId, {
          risingEntriesThisWeek: creator.risingEntriesThisWeek,
          openLaneListingsToday: creator.openLaneListingsToday,
          firstListingAt: creator.firstListingAt
            ? new Date(creator.firstListingAt)
            : null,
        });
      }
    }
  }

  return {
    ok: true as const,
    txHash: mintTxHash,
    softLaunched,
    softLaunchErrors,
    skippedUnverified,
  };
}

/** Soft-launch every minted draft in a collection (owner recovery path). */
export async function softLaunchMintedDraftsInCollection(input: {
  collectionId: string;
  creatorId: string;
}) {
  const engine = await getDiscoveryEngine();
  const collection = engine.state.collections.get(input.collectionId);
  if (!collection) return { ok: false as const, error: "collection_not_found" };
  if (collection.creatorId !== input.creatorId) {
    return { ok: false as const, error: "collection_forbidden" };
  }

  const drafts = [...engine.state.listings.values()].filter(
    (l) =>
      l.collectionId === input.collectionId &&
      l.stage === "draft" &&
      !l.delisted &&
      Boolean(l.tokenId && l.contractAddress && l.mintTxHash) &&
      !String(l.mintTxHash).toLowerCase().startsWith("simulated-mint:") &&
      !String(l.mintTxHash).toLowerCase().startsWith("pending:"),
  );

  const softLaunched: string[] = [];
  const errors: Array<{ listingId: string; errors: string[] }> = [];
  for (const listing of drafts) {
    const staged = await transitionListingStage(listing.id, "soft_launch", {
      skipPublishRateLimit: true,
    });
    if (staged.ok) softLaunched.push(listing.id);
    else errors.push({ listingId: listing.id, errors: staged.errors });
  }

  return {
    ok: true as const,
    softLaunched,
    remainingDrafts: drafts.length - softLaunched.length,
    errors,
  };
}

export async function updateCollectionProfile(input: {
  collectionId: string;
  creatorId: string;
  description?: string;
  imageUrl?: string | null;
  bannerUrl?: string | null;
  websiteUrl?: string | null;
  twitterUrl?: string | null;
  discordUrl?: string | null;
  instagramUrl?: string | null;
}) {
  const engine = await getDiscoveryEngine();
  const existing = engine.state.collections.get(input.collectionId);
  if (!existing) return { ok: false as const, errors: ["collection_not_found"] };
  if (existing.creatorId !== input.creatorId) {
    return { ok: false as const, errors: ["collection_forbidden"] };
  }

  const { validateCollectionProfileFields } = await import(
    "@/lib/marketplace/collection-profile"
  );
  const profileCheck = validateCollectionProfileFields({
    description: input.description,
    imageUrl: input.imageUrl,
    bannerUrl: input.bannerUrl,
    websiteUrl: input.websiteUrl,
    twitterUrl: input.twitterUrl,
    discordUrl: input.discordUrl,
    instagramUrl: input.instagramUrl,
  });
  if (!profileCheck.ok) {
    return { ok: false as const, errors: profileCheck.issues };
  }
  if (Object.keys(profileCheck.data).length === 0) {
    return { ok: false as const, errors: ["empty_patch"] };
  }

  const next: Collection = {
    ...existing,
    ...profileCheck.data,
  };

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();

  if (mode === "memory" || isMemoryMode()) {
    getMemoryEngine().state.collections.set(input.collectionId, next);
    return { ok: true as const, collection: next, errors: [] as string[] };
  }

  const updated = await prisma.collection.update({
    where: { id: input.collectionId },
    data: profileCheck.data,
  });
  const mapped = toCollection(updated);
  engine.state.collections.set(input.collectionId, mapped);
  return {
    ok: true as const,
    collection: mapped,
    errors: [] as string[],
  };
}

/**
 * Cache registry peers onto the collection row (DB is not authoritative).
 * Soft-gated to the marketplace collection creator.
 */
export async function cacheCollectionLinkedTokens(input: {
  collectionId: string;
  creatorId: string;
  tokens: unknown;
  /** When true, skip chain validation (already read from registry). */
  fromRegistry?: boolean;
}) {
  const engine = await getDiscoveryEngine();
  const existing = engine.state.collections.get(input.collectionId);
  if (!existing) return { ok: false as const, errors: ["collection_not_found"] };
  if (existing.creatorId !== input.creatorId) {
    return { ok: false as const, errors: ["collection_forbidden"] };
  }

  const { serializeLinkedTokens, validateLinkedTokensInput } = await import(
    "@/lib/marketplace/linked-tokens"
  );
  type LinkedTokenRef = import("@/lib/marketplace/linked-tokens").LinkedTokenRef;

  let tokens: LinkedTokenRef[];
  if (input.fromRegistry && Array.isArray(input.tokens)) {
    tokens = input.tokens as LinkedTokenRef[];
  } else {
    const checked = validateLinkedTokensInput(input.tokens, existing.chain);
    if (!checked.ok) {
      return { ok: false as const, errors: checked.issues };
    }
    tokens = checked.tokens;
  }

  const linkedTokensJson = serializeLinkedTokens(tokens);
  const next: Collection = {
    ...existing,
    linkedTokens: tokens,
  };

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();

  if (mode === "memory" || isMemoryMode()) {
    getMemoryEngine().state.collections.set(input.collectionId, next);
    return { ok: true as const, collection: next, errors: [] as string[] };
  }

  const updated = await prisma.collection.update({
    where: { id: input.collectionId },
    data: { linkedTokensJson },
  });
  const mapped = toCollection(updated);
  engine.state.collections.set(input.collectionId, mapped);
  return {
    ok: true as const,
    collection: mapped,
    errors: [] as string[],
  };
}

/** @deprecated Display-only writes rejected — use registry plan + cache after confirm. */
export async function updateCollectionLinkedTokens(input: {
  collectionId: string;
  creatorId: string;
  tokens: unknown;
}) {
  void input;
  return {
    ok: false as const,
    errors: ["registry_required"],
  };
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
    excludeCollectionId: input.collectionId,
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

export async function listCollectionsForUser(
  creatorId: string,
  opts?: {
    network?: NetworkId | string | null;
    /** When true, only collections with a confirmed real on-chain address. */
    deployedOnly?: boolean;
  },
) {
  const engine = await getDiscoveryEngine();
  const networkFilter = opts?.network
    ? resolveNetwork(opts.network)
    : null;
  return [...engine.state.collections.values()].filter((c) => {
    if (c.creatorId !== creatorId) return false;
    if (networkFilter) {
      const cNet = resolveNetwork(c.network, c.chain);
      if (cNet !== networkFilter) return false;
    }
    if (opts?.deployedOnly && !isCollectionDeployReady(c)) return false;
    return true;
  });
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
  options?: {
    /**
     * Skip the new-creator daily soft-launch cap.
     * Used when mint just confirmed — gas was already paid to publish.
     */
    skipPublishRateLimit?: boolean;
  },
) {
  const engine = await getDiscoveryEngine();
  if (target === "soft_launch" && !options?.skipPublishRateLimit) {
    const current = engine.state.listings.get(listingId);
    const creator = current
      ? engine.state.creators.get(current.creatorId)
      : null;
    if (current && creator) {
      const {
        NEW_CREATOR_DAILY_PUBLISH_LIMIT,
        shouldRateLimitPublishes,
      } = await import("@/lib/marketplace/trust");
      if (
        shouldRateLimitPublishes({
          curatorScore: creator.curatorScore,
          walletCreatedAtMs: creator.walletCreatedAt,
        }) &&
        (creator.openLaneListingsToday ?? 0) >= NEW_CREATOR_DAILY_PUBLISH_LIMIT
      ) {
        return {
          ok: false as const,
          errors: [
            `new_creator_daily_limit_${NEW_CREATOR_DAILY_PUBLISH_LIMIT}`,
          ],
        };
      }
    }
  }
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
    saleMode?: string | null;
    startingBidUsd?: number | null;
    reserveUsd?: number | null;
    currentHighBidUsd?: number | null;
    highBidderId?: string | null;
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
        saleMode: (l as { saleMode?: string | null }).saleMode ?? null,
        startingBidUsd: (l as { startingBidUsd?: number | null }).startingBidUsd ?? null,
        reserveUsd: (l as { reserveUsd?: number | null }).reserveUsd ?? null,
        currentHighBidUsd: (l as { currentHighBidUsd?: number | null }).currentHighBidUsd ?? null,
        highBidderId: (l as { highBidderId?: string | null }).highBidderId ?? null,
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
          saleMode: listing.saleMode,
          startingBidUsd: listing.startingBidUsd,
          reserveUsd: listing.reserveUsd,
          currentHighBidUsd: listing.currentHighBidUsd,
          highBidderId: listing.highBidderId,
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

  let amountUsd = input.amountUsd ?? listing.priceUsd ?? 0;
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

  const { resolveSaleMode } = await import("@/lib/marketplace/sale-mode");
  const { englishSettlement } = await import("@/lib/marketplace/english-auction");
  const saleMode = resolveSaleMode({
    type: listing.type,
    saleMode: listing.saleMode,
  });
  if (saleMode === "english") {
    const settled = englishSettlement({
      listing: {
        id: listing.id,
        creatorId: listing.creatorId,
        type: listing.type,
        saleMode: listing.saleMode,
        delisted: listing.delisted,
        priceUsd: listing.priceUsd,
        startingBidUsd: listing.startingBidUsd,
        reserveUsd: listing.reserveUsd,
        currentHighBidUsd: listing.currentHighBidUsd,
        highBidderId: listing.highBidderId,
        auctionStartsAt: listing.auctionStartsAt,
        auctionEndsAt: listing.auctionEndsAt,
      },
      buyerId: input.buyerId,
    });
    if (!settled.ok) {
      if (settled.error === "auction_still_open") {
        return { ok: false as const, error: "use_bid" };
      }
      return { ok: false as const, error: settled.error };
    }
    // Winner claims at winning bid (override list price).
    input = { ...input, amountUsd: settled.amountUsd };
    amountUsd = settled.amountUsd;
  }

  if (saleMode === "dutch") {
    const { dutchCurrentPriceUsd } = await import("@/lib/marketplace/sale-mode");
    const dutchPrice = dutchCurrentPriceUsd({
      startingBidUsd: listing.startingBidUsd,
      priceUsd: listing.priceUsd,
      reserveUsd: listing.reserveUsd,
      auctionStartsAt: listing.auctionStartsAt,
      auctionEndsAt: listing.auctionEndsAt,
    });
    if (dutchPrice == null || !(dutchPrice > 0)) {
      return { ok: false as const, error: "invalid_dutch_price" };
    }
    input = { ...input, amountUsd: dutchPrice };
    amountUsd = dutchPrice;
  }

  const window = dropWindowFor(listing, collection);
  if (saleMode !== "english") {
    if (window.state === "upcoming") {
      return { ok: false as const, error: "drop_not_started" };
    }
    if (window.state === "ended") {
      return { ok: false as const, error: "drop_ended" };
    }
  }

  const {
    countReservingPurchases,
    findBuyerOpenPurchase,
  } = await import("@/lib/marketplace/sales");
  const existingOpen = await findBuyerOpenPurchase(listing.id, input.buyerId);
  if (existingOpen) {
    const resumed = await resumeCryptoPurchase({
      purchaseId: existingOpen.id,
      buyerId: input.buyerId,
      buyerPaymentAddress: input.buyerPaymentAddress,
    });
    if (!resumed.ok) return resumed;
    const settleQuote = (
      await import("@/lib/onchain/fx")
    ).quoteNativeFromUsd(amountUsd, listing.chain);
    return {
      ok: true as const,
      purchaseId: resumed.purchaseId,
      status: resumed.status,
      txHash: "txHash" in resumed ? resumed.txHash ?? null : null,
      paymentTxHash:
        "paymentTxHash" in resumed ? resumed.paymentTxHash ?? null : null,
      transferTxHash: null,
      isFirst: false,
      emerging: false,
      paymentWalletTx:
        "paymentWalletTx" in resumed ? resumed.paymentWalletTx : undefined,
      transferWalletTx:
        "transferWalletTx" in resumed ? resumed.transferWalletTx : undefined,
      bridge: "bridge" in resumed ? resumed.bridge ?? null : null,
      quote: publicPayQuote({
        settle: settleQuote,
        pay: settleQuote,
        bridged: input.payNetwork !== listing.network,
      }),
      settlementAddress:
        "settlementAddress" in resumed
          ? resumed.settlementAddress
          : settlementAddressFor(listing.network),
      fees,
      feeRecipients,
      chain: listing.chain,
      network: listing.network,
      payNetwork: input.payNetwork,
      payNetworks: payNetworksForListing(listing.network),
      buyerReceiveAddress: input.buyerReceiveAddress,
      resumed: true as const,
    };
  }

  const soldCount = await countReservingPurchases(listing.id);
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
      (p) =>
        p.buyerId === input.buyerId &&
        p.listingId === input.listingId &&
        (p.status ?? "completed") === "completed",
    );
  } else {
    const prior = await prisma.purchase.count({
      where: {
        buyerId: input.buyerId,
        listingId: input.listingId,
        status: "completed",
      },
    });
    isFirst = prior === 0;
  }

  const creatorBoing =
    engine.state.creators
      .get(listing.creatorId)
      ?.wallets.find((w) => w.chain === "boing")?.address ?? null;
  const settlementAddress = settlementAddressFor(listing.network, {
    fallbackBoing: creatorBoing,
  });
  if (listing.network === "boing" && !settlementAddress) {
    return { ok: false as const, error: "boing_settlement_unavailable" };
  }
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
    try {
      const pay = await buildNativePaymentWalletTx({
        network: listing.network,
        fromAddress: input.buyerPaymentAddress,
        toAddress: settlementAddress,
        amountUsd,
        listingChain: listing.chain,
      });
      paymentWalletTx = pay.walletTx;
      settleQuote = pay.quote;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "payment_prepare_failed";
      return {
        ok: false as const,
        error:
          msg === "boing_settlement_unavailable" ||
          msg === "boing_account_id_required"
            ? msg
            : msg,
      };
    }
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
  /** Live Relay quotes require a connected payment wallet address. */
  buyerPaymentAddress?: string;
}) {
  const {
    assertCryptoPayAllowed,
    buildCrossChainPayQuote,
    listingIsMinted,
    payNetworksForListing,
    publicPayQuote,
    settlementAddressFor,
    splitSaleProceeds,
  } = await import("@/lib/marketplace/crypto-purchase");
  const { quotePayInFromUsdAt } = await import("@/lib/onchain/fx");

  const loaded = await loadPurchaseListingRow(input.listingId);
  if (!loaded.ok) return loaded;
  const { listing, engine } = loaded;
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
  const creatorBoing =
    engine.state.creators
      .get(listing.creatorId)
      ?.wallets.find((w) => w.chain === "boing")?.address ?? null;
  const settlementAddress = settlementAddressFor(listing.network, {
    fallbackBoing: creatorBoing,
  });

  let bridge: {
    requestId?: string;
    fromNetwork?: string;
    toNetwork?: string;
    amount?: string;
    estimatedOutput?: string;
    feeUsd?: string;
  } | null = null;
  let needsPaymentAddress = false;

  if (bridged) {
    if (!input.buyerPaymentAddress) {
      // FX-only until the payment wallet is connected (P1: no Relay without wallet).
      needsPaymentAddress = true;
    } else {
      try {
        const live = await buildCrossChainPayQuote({
          listingNetwork: listing.network,
          payNetwork: input.payNetwork,
          amountUsd,
          buyerPaymentAddress: input.buyerPaymentAddress,
          settlementAddress,
        });
        if (live.bridge) {
          bridge = {
            requestId: live.bridge.requestId,
            fromNetwork: live.bridge.fromNetwork,
            toNetwork: live.bridge.toNetwork,
            amount: live.bridge.amount,
            estimatedOutput: live.bridge.estimatedOutput,
            feeUsd: live.bridge.feeUsd,
          };
        }
      } catch {
        // feeUsd is best-effort — still return FX quote so checkout can proceed.
        bridge = null;
      }
    }
  }

  return {
    ok: true as const,
    listingId: listing.id,
    network: listing.network,
    chain: listing.chain,
    payNetwork: input.payNetwork,
    payNetworks: payNetworksForListing(listing.network),
    amountUsd,
    fees: splitSaleProceeds(amountUsd),
    settlementAddress,
    quote: publicPayQuote({
      settle: quotes.settle,
      pay: quotes.pay,
      bridged,
    }),
    bridge,
    needsPaymentAddress,
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
  if (purchase.status === "failed") {
    return { ok: false as const, error: "checkout_expired" };
  }
  const { purchaseReservesSupply } = await import("@/lib/marketplace/lifecycle");
  if (
    purchase.status === "pending_payment" &&
    !purchaseReservesSupply(purchase)
  ) {
    return { ok: false as const, error: "checkout_expired" };
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
    if (purchase.status === "completed") {
      return {
        ok: true as const,
        purchaseId: purchase.id,
        status: "completed" as const,
        txHash: purchase.txHash ?? input.txHash,
        withdrawnAt: purchase.withdrawnAt
          ? Number(purchase.withdrawnAt)
          : Date.now(),
        boingPaymentSettled: network === "boing" ? true : undefined,
      };
    }
    if (purchase.status === "pending_transfer" && network !== "boing") {
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
        buyerReceiveAddress: purchase.withdrawAddress || input.buyerId,
      });
      return {
        ok: true as const,
        purchaseId: purchase.id,
        status: "pending_transfer" as const,
        transferWalletTx: transferIntent.walletTx,
      };
    }

    /**
     * Boing reference NFTs require CALLER = current owner for transfer_nft.
     * After publish mint the creator owns the token, so the buyer cannot sign
     * the custody transfer. Settle the sale on successful payment (mempool ok
     * or real hash) and record FreshMint ownership without a second buyer tx.
     * Also recovers rows stuck in pending_transfer from the old two-step path.
     */
    if (network === "boing") {
      const withdrawnAt = Date.now();
      const completePatch = {
        status: "completed" as const,
        paymentTxHash: input.txHash,
        bridgeRequestId: input.bridgeRequestId ?? purchase.bridgeRequestId,
        txHash: input.txHash,
        withdrawTxHash: input.txHash,
        withdrawnAt,
      };
      if (memory) {
        const wasCompleteMem = purchase.status === "completed";
        updateMemoryPurchase(purchase.id, completePatch);
        if (!wasCompleteMem) {
          try {
            const { notifyCreatorItemSold } = await import(
              "@/lib/notifications/emit"
            );
            await notifyCreatorItemSold({
              creatorId: listing.creatorId,
              listingId: listing.id,
              listingTitle: listing.title,
              purchaseId: purchase.id,
              amountUsd: purchase.amountUsd,
            });
          } catch (err) {
            console.warn("[freshmint] sale notify failed", err);
          }
          engine.recordPurchase({
            listingId: purchase.listingId,
            buyerId: input.buyerId,
            amountUsd: purchase.amountUsd,
            isFirstPurchaseForBuyerOnArtifact: true,
          });
        }
      } else {
        const wasComplete = purchase.status === "completed";
        await prisma.purchase.update({
          where: { id: purchase.id },
          data: {
            status: "completed",
            paymentTxHash: input.txHash,
            bridgeRequestId: input.bridgeRequestId ?? purchase.bridgeRequestId,
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
                boingPaymentSettled: true,
              }),
            },
          });
          try {
            const { notifyCreatorItemSold } = await import(
              "@/lib/notifications/emit"
            );
            await notifyCreatorItemSold({
              creatorId: listing.creatorId,
              listingId: listing.id,
              listingTitle: listing.title,
              purchaseId: purchase.id,
              amountUsd: purchase.amountUsd,
            });
          } catch (err) {
            console.warn("[freshmint] sale notify failed", err);
          }
        }
      }
      return {
        ok: true as const,
        purchaseId: purchase.id,
        status: "completed" as const,
        txHash: input.txHash,
        withdrawnAt,
        boingPaymentSettled: true as const,
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
    const wasCompleteMem = purchase.status === "completed";
    updateMemoryPurchase(purchase.id, {
      ...completePatch,
      withdrawnAt,
    });
    if (!wasCompleteMem) {
      try {
        const { notifyCreatorItemSold, notifyCreatorEnglishSold } =
          await import("@/lib/notifications/emit");
        const isEnglishAward =
          typeof purchase.txHash === "string" &&
          purchase.txHash.startsWith("english-award:");
        if (isEnglishAward) {
          await notifyCreatorEnglishSold({
            creatorId: listing.creatorId,
            listingId: listing.id,
            listingTitle: listing.title,
            purchaseId: purchase.id,
            amountUsd: purchase.amountUsd,
          });
        } else {
          await notifyCreatorItemSold({
            creatorId: listing.creatorId,
            listingId: listing.id,
            listingTitle: listing.title,
            purchaseId: purchase.id,
            amountUsd: purchase.amountUsd,
          });
        }
      } catch (err) {
        console.warn("[freshmint] sale notify failed", err);
      }
    }
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
      try {
        const { notifyCreatorItemSold, notifyCreatorEnglishSold } =
          await import("@/lib/notifications/emit");
        const isEnglishAward =
          typeof purchase.txHash === "string" &&
          purchase.txHash.startsWith("english-award:");
        if (isEnglishAward) {
          await notifyCreatorEnglishSold({
            creatorId: listing.creatorId,
            listingId: listing.id,
            listingTitle: listing.title,
            purchaseId: purchase.id,
            amountUsd: purchase.amountUsd,
          });
        } else {
          await notifyCreatorItemSold({
            creatorId: listing.creatorId,
            listingId: listing.id,
            listingTitle: listing.title,
            purchaseId: purchase.id,
            amountUsd: purchase.amountUsd,
          });
        }
      } catch (err) {
        console.warn("[freshmint] sale notify failed", err);
      }
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

/** Resume an interrupted crypto buy (payment or NFT transfer still pending). */
export async function resumeCryptoPurchase(input: {
  purchaseId: string;
  buyerId: string;
  buyerPaymentAddress?: string;
}) {
  const {
    buildCrossChainPayQuote,
    buildNativePaymentWalletTx,
    buildPurchaseTransferIntent,
    listingIsMinted,
    settlementAddressFor,
  } = await import("@/lib/marketplace/crypto-purchase");
  const engine = await getDiscoveryEngine();
  const { isMemoryMode, getMemoryPurchases } = await import(
    "@/lib/data/memory-store"
  );
  const memory = (await inMemoryMode()) || isMemoryMode();

  const purchase = memory
    ? getMemoryPurchases().find((p) => p.id === input.purchaseId)
    : await prisma.purchase.findUnique({ where: { id: input.purchaseId } });
  if (!purchase || purchase.buyerId !== input.buyerId) {
    return { ok: false as const, error: "unavailable" };
  }
  if (purchase.status === "failed") {
    return { ok: false as const, error: "checkout_expired" };
  }

  const status = ("status" in purchase && purchase.status) || "completed";
  const { purchaseReservesSupply } = await import("@/lib/marketplace/lifecycle");
  if (status === "pending_payment" && !purchaseReservesSupply(purchase)) {
    return { ok: false as const, error: "checkout_expired" };
  }
  const payNetwork = (
    "payNetwork" in purchase ? purchase.payNetwork : null
  ) as NetworkId | null;
  const listing = engine.state.listings.get(purchase.listingId);
  if (!listing || !listingIsMinted(listing)) {
    return { ok: false as const, error: "unavailable" };
  }
  const network = resolveNetwork(listing.network, listing.chain);
  const collection = listing.collectionId
    ? engine.state.collections.get(listing.collectionId)
    : null;
  const receiveAddress =
    purchase.withdrawAddress ||
    engine.state.creators
      .get(input.buyerId)
      ?.wallets.find((w) => w.chain === listing.chain)?.address ||
    "";

  if (status === "completed" || purchase.withdrawnAt) {
    return {
      ok: true as const,
      purchaseId: purchase.id,
      status: "completed" as const,
      listingId: listing.id,
      chain: listing.chain,
      network,
      txHash: purchase.txHash,
      withdrawTxHash: purchase.withdrawTxHash,
    };
  }

  const escrowAddress =
    collection?.escrowAddress ||
    listing.contractAddress ||
    receiveAddress;

  if (status === "pending_transfer") {
    // Boing primary buys settle on payment — recover stuck pending_transfer rows.
    if (network === "boing") {
      const payHash =
        ("paymentTxHash" in purchase && purchase.paymentTxHash) ||
        purchase.txHash ||
        `pending:boing-settled:${purchase.id}`;
      const settled = await confirmCryptoPurchase({
        purchaseId: purchase.id,
        buyerId: input.buyerId,
        step: "payment",
        txHash: String(payHash),
      });
      if (!settled.ok) return settled;
      return {
        ok: true as const,
        purchaseId: purchase.id,
        status: "completed" as const,
        listingId: listing.id,
        chain: listing.chain,
        network,
        txHash: "txHash" in settled ? settled.txHash : payHash,
        boingPaymentSettled: true as const,
      };
    }
    if (!receiveAddress) {
      return { ok: false as const, error: "wallet_required" };
    }
    const transferIntent = buildPurchaseTransferIntent({
      listingNetwork: network,
      listingChain: listing.chain,
      contractAddress: listing.contractAddress!,
      tokenId: listing.tokenId!,
      escrowAddress: escrowAddress!,
      buyerReceiveAddress: receiveAddress,
    });
    return {
      ok: true as const,
      purchaseId: purchase.id,
      status: "pending_transfer" as const,
      listingId: listing.id,
      chain: listing.chain,
      network,
      payNetwork,
      receiveAddress,
      paymentTxHash:
        "paymentTxHash" in purchase ? purchase.paymentTxHash : null,
      transferWalletTx: transferIntent.walletTx,
    };
  }

  if (status === "pending_payment") {
    if (!payNetwork) {
      return { ok: false as const, error: "unavailable" };
    }
    if (!input.buyerPaymentAddress) {
      return {
        ok: true as const,
        purchaseId: purchase.id,
        status: "pending_payment" as const,
        listingId: listing.id,
        chain: listing.chain,
        network,
        payNetwork,
        receiveAddress,
        needsPaymentAddress: true as const,
        amountUsd: purchase.amountUsd,
      };
    }
    const creatorBoing =
      engine.state.creators
        .get(listing.creatorId)
        ?.wallets.find((w) => w.chain === "boing")?.address ?? null;
    const settlementAddress = settlementAddressFor(network, {
      fallbackBoing: creatorBoing,
    });
    if (network === "boing" && !settlementAddress) {
      return { ok: false as const, error: "boing_settlement_unavailable" };
    }
    const crossChain = payNetwork !== network;
    if (crossChain) {
      try {
        const bridgeQuote = await buildCrossChainPayQuote({
          listingNetwork: network,
          payNetwork,
          amountUsd: purchase.amountUsd,
          buyerPaymentAddress: input.buyerPaymentAddress,
          settlementAddress,
        });
        return {
          ok: true as const,
          purchaseId: purchase.id,
          status: "pending_payment" as const,
          listingId: listing.id,
          chain: listing.chain,
          network,
          payNetwork,
          receiveAddress,
          settlementAddress,
          amountUsd: purchase.amountUsd,
          bridge: bridgeQuote.bridge
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
        };
      } catch (e) {
        return {
          ok: false as const,
          error: e instanceof Error ? e.message : "bridge_quote_failed",
        };
      }
    }
    try {
      const pay = await buildNativePaymentWalletTx({
        network,
        fromAddress: input.buyerPaymentAddress,
        toAddress: settlementAddress,
        amountUsd: purchase.amountUsd,
        listingChain: listing.chain,
      });
      return {
        ok: true as const,
        purchaseId: purchase.id,
        status: "pending_payment" as const,
        listingId: listing.id,
        chain: listing.chain,
        network,
        payNetwork,
        receiveAddress,
        settlementAddress,
        amountUsd: purchase.amountUsd,
        paymentWalletTx: pay.walletTx,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "payment_prepare_failed";
      return { ok: false as const, error: msg };
    }
  }

  return { ok: false as const, error: "unavailable" };
}

/** Release an unpaid checkout so the listing can be bought again. */
export async function cancelCryptoPurchase(input: {
  purchaseId: string;
  buyerId: string;
}) {
  const { isMemoryMode, getMemoryPurchases, updateMemoryPurchase } =
    await import("@/lib/data/memory-store");
  const memory = (await inMemoryMode()) || isMemoryMode();
  const purchase = memory
    ? getMemoryPurchases().find((p) => p.id === input.purchaseId)
    : await prisma.purchase.findUnique({ where: { id: input.purchaseId } });
  if (!purchase || purchase.buyerId !== input.buyerId) {
    return { ok: false as const, error: "unavailable" };
  }
  const status = ("status" in purchase && purchase.status) || "completed";
  if (status === "completed" || purchase.withdrawnAt) {
    return { ok: false as const, error: "already_complete" };
  }
  if (status === "pending_transfer") {
    return { ok: false as const, error: "payment_already_landed" };
  }
  if (status === "failed") {
    return { ok: true as const, purchaseId: purchase.id, status: "failed" as const };
  }
  if (status !== "pending_payment") {
    return { ok: false as const, error: "unavailable" };
  }

  if (memory) {
    updateMemoryPurchase(purchase.id, { status: "failed" });
  } else {
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { status: "failed" },
    });
  }
  return { ok: true as const, purchaseId: purchase.id, status: "failed" as const };
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


export async function updateListingSaleMode(input: {
  listingId: string;
  /** @deprecated use actorId — kept for call-site compatibility */
  creatorId?: string;
  actorId?: string;
  saleMode: "fixed" | "timed_window" | "english" | string;
  startingBidUsd?: number | null;
  reserveUsd?: number | null;
  auctionStartsAt?: string | null;
  auctionEndsAt?: string | null;
  priceUsd?: number | null;
}) {
  const { parseSaleMode, listingTypeForSaleMode, resolveSaleMode } = await import(
    "@/lib/marketplace/sale-mode"
  );
  const { canManageListing } = await import("@/lib/marketplace/listing-manage");
  const saleMode = parseSaleMode(input.saleMode);
  const engine = await getDiscoveryEngine();
  const listing = engine.state.listings.get(input.listingId);
  if (!listing) return { ok: false as const, error: "not_found" };
  const actorId = input.actorId ?? input.creatorId;
  if (!canManageListing(actorId, listing)) {
    return { ok: false as const, error: "forbidden" };
  }
  if ((listing as { currentHighBidUsd?: number | null }).currentHighBidUsd) {
    return { ok: false as const, error: "has_bids" };
  }

  const nextType =
    saleMode === "fixed"
      ? listing.type === "auction"
        ? "single"
        : listing.type
      : listingTypeForSaleMode(saleMode, listing.type);

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();

  const patch = {
    saleMode,
    type: nextType,
    startingBidUsd:
      saleMode === "english" || saleMode === "dutch"
        ? (input.startingBidUsd ?? listing.priceUsd ?? null)
        : null,
    reserveUsd:
      saleMode === "english" || saleMode === "dutch"
        ? (input.reserveUsd ?? null)
        : null,
    auctionStartsAt:
      saleMode === "fixed"
        ? null
        : input.auctionStartsAt
          ? new Date(input.auctionStartsAt).getTime()
          : listing.auctionStartsAt,
    auctionEndsAt:
      saleMode === "fixed"
        ? null
        : input.auctionEndsAt
          ? new Date(input.auctionEndsAt).getTime()
          : listing.auctionEndsAt,
    priceUsd:
      input.priceUsd !== undefined
        ? input.priceUsd
        : saleMode === "dutch"
          ? (input.startingBidUsd ?? listing.priceUsd)
          : listing.priceUsd,
  };

  if (mode === "memory" || isMemoryMode()) {
    const mem = getMemoryEngine();
    const live = mem.state.listings.get(input.listingId);
    if (!live) return { ok: false as const, error: "not_found" };
    Object.assign(live, {
      saleMode: patch.saleMode,
      type: patch.type,
      startingBidUsd: patch.startingBidUsd,
      reserveUsd: patch.reserveUsd,
      auctionStartsAt: patch.auctionStartsAt,
      auctionEndsAt: patch.auctionEndsAt,
      priceUsd: patch.priceUsd,
    });
    mem.state.listings.set(input.listingId, live);
    return { ok: true as const, listing: live };
  }

  const updated = await prisma.listing.update({
    where: { id: input.listingId },
    data: {
      saleMode: patch.saleMode,
      type: patch.type,
      startingBidUsd: patch.startingBidUsd,
      reserveUsd: patch.reserveUsd,
      auctionStartsAt: patch.auctionStartsAt
        ? new Date(patch.auctionStartsAt)
        : null,
      auctionEndsAt: patch.auctionEndsAt ? new Date(patch.auctionEndsAt) : null,
      priceUsd: patch.priceUsd,
    },
  });
  const { toListing } = await import("@/lib/data/mappers");
  return { ok: true as const, listing: toListing(updated) };
}
