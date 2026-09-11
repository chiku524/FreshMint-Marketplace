import { DISCOVERY_CONFIG } from "./config";
import { isEmergingListing } from "./emerging";
import type { CreatorProfile, LaunchStage, Listing, ListingType } from "./types";

export const STAGE_ORDER: LaunchStage[] = [
  "draft",
  "soft_launch",
  "rising_eligible",
  "featured_eligible",
  "featured",
];

export function stageIndex(stage: LaunchStage): number {
  return STAGE_ORDER.indexOf(stage);
}

export function canTransition(from: LaunchStage, to: LaunchStage): boolean {
  // Allow forward moves and demotion from featured → featured_eligible only via explicit paths.
  if (from === to) return true;
  if (to === "draft") return false;
  return stageIndex(to) === stageIndex(from) + 1 || (from === "featured" && to === "featured_eligible");
}

export interface StageGateResult {
  ok: boolean;
  errors: string[];
  nextStage: LaunchStage | null;
}

/** Soft launch: visible in Open Lane + artist profile only. */
export function canSoftLaunch(listing: Listing): StageGateResult {
  const errors: string[] = [];
  if (listing.stage !== "draft") errors.push("must_be_draft");
  if (!listing.title.trim()) errors.push("title_required");
  if (!listing.mediaHash) errors.push("media_required");
  if (!listing.metadataComplete) errors.push("metadata_incomplete");
  // Crypto buys require ownership at purchase — don't publish unminted inventory.
  if (!listing.tokenId || !listing.contractAddress || !listing.mintTxHash) {
    errors.push("listing_not_minted");
  }
  return {
    ok: errors.length === 0,
    errors,
    nextStage: errors.length === 0 ? "soft_launch" : null,
  };
}

/**
 * True when this creator has never held a Rising-or-later listing.
 * Used so a debut work can skip the new-wallet cooldown.
 */
export function isFirstRisingLook(
  creatorId: string,
  listings: Iterable<Listing>,
  exceptListingId?: string,
): boolean {
  for (const listing of listings) {
    if (listing.creatorId !== creatorId) continue;
    if (exceptListingId && listing.id === exceptListingId) continue;
    if (listing.risingEligibleAt != null) return false;
    if (stageIndex(listing.stage) >= stageIndex("rising_eligible")) return false;
  }
  return true;
}

/**
 * Rising eligibility after light quality gates.
 * Verification badge is NOT required.
 */
export function canBecomeRisingEligible(
  listing: Listing,
  creator: CreatorProfile,
  now = Date.now(),
  options?: { firstRisingLook?: boolean },
): StageGateResult {
  const errors: string[] = [];
  if (listing.stage !== "soft_launch") errors.push("must_be_soft_launch");
  if (DISCOVERY_CONFIG.risingGates.requireMetadataComplete && !listing.metadataComplete) {
    errors.push("metadata_incomplete");
  }
  if (DISCOVERY_CONFIG.risingGates.requireOriginalMedia && !listing.originalMedia) {
    errors.push("original_media_required");
  }
  if (DISCOVERY_CONFIG.risingGates.requireNotFlagged && creator.flagged) {
    errors.push("creator_flagged");
  }
  if (DISCOVERY_CONFIG.risingGates.requireNotDelisted && listing.delisted) {
    errors.push("listing_delisted");
  }
  if (creator.washCluster) errors.push("wash_cluster");

  const skipCooldown =
    options?.firstRisingLook && DISCOVERY_CONFIG.firstLook.skipWalletCooldown;
  if (!skipCooldown) {
    const walletAge = now - creator.walletCreatedAt;
    if (walletAge < DISCOVERY_CONFIG.newWalletRisingCooldownMs) {
      errors.push("new_wallet_cooldown");
    }
  }

  if (
    creator.risingEntriesThisWeek >=
    DISCOVERY_CONFIG.risingEntriesPerCreatorPerWeek
  ) {
    errors.push("rising_weekly_cap");
  }

  // Type-specific clocks
  if (listing.type === "open_edition") {
    if (listing.oeStartsAt == null || listing.oeEndsAt == null) {
      errors.push("oe_window_required");
    }
  }
  if (listing.type === "auction") {
    if (listing.auctionStartsAt == null || listing.auctionEndsAt == null) {
      errors.push("auction_window_required");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    nextStage: errors.length === 0 ? "rising_eligible" : null,
  };
}

export interface RisingDiagnosis {
  ready: boolean;
  errors: string[];
  firstRisingLook: boolean;
  cooldownRemainingMs: number;
}

/** Why a listing is or is not Rising — used for creator-facing hints. */
export function diagnoseRisingEligibility(
  listing: Listing,
  creator: CreatorProfile,
  listings: Iterable<Listing>,
  now = Date.now(),
): RisingDiagnosis {
  const firstRisingLook = isFirstRisingLook(creator.id, listings, listing.id);
  const elapsed = now - creator.walletCreatedAt;
  const need = DISCOVERY_CONFIG.newWalletRisingCooldownMs;
  const cooldownApplies =
    !firstRisingLook || !DISCOVERY_CONFIG.firstLook.skipWalletCooldown;
  const cooldownRemainingMs =
    cooldownApplies && elapsed < need ? need - elapsed : 0;

  if (
    listing.stage === "rising_eligible" ||
    listing.stage === "featured_eligible" ||
    listing.stage === "featured"
  ) {
    return {
      ready: true,
      errors: [],
      firstRisingLook,
      cooldownRemainingMs: 0,
    };
  }

  if (listing.stage !== "soft_launch") {
    return {
      ready: false,
      errors: listing.stage === "draft" ? ["must_be_soft_launch"] : [],
      firstRisingLook,
      cooldownRemainingMs,
    };
  }

  const gate = canBecomeRisingEligible(listing, creator, now, { firstRisingLook });
  return {
    ready: gate.ok,
    errors: gate.errors,
    firstRisingLook,
    cooldownRemainingMs,
  };
}

/** Featured eligible via curator or collector nomination path. */
export function canBecomeFeaturedEligible(
  listing: Listing,
  creator?: CreatorProfile,
  now = Date.now(),
): StageGateResult {
  const errors: string[] = [];
  if (listing.stage !== "rising_eligible" && listing.stage !== "featured") {
    errors.push("must_be_rising_or_featured");
  }
  if (listing.delisted) errors.push("listing_delisted");
  if (listing.signals.nominationScore < 1 && listing.stage !== "featured") {
    const traction = DISCOVERY_CONFIG.featuredTraction;
    const emerging = creator
      ? isEmergingListing(listing, creator, now).emerging
      : false;
    const viewers = emerging
      ? traction.emergingUniqueViewers
      : traction.uniqueViewers;
    const saves = emerging ? traction.emergingSaves : traction.saves;
    if (
      listing.signals.uniqueViewers < viewers &&
      listing.signals.saves < saves
    ) {
      errors.push("nomination_or_traction_required");
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    nextStage: errors.length === 0 ? "featured_eligible" : null,
  };
}

export function canBecomeFeatured(listing: Listing): StageGateResult {
  const errors: string[] = [];
  if (listing.stage !== "featured_eligible") {
    errors.push("must_be_featured_eligible");
  }
  if (listing.delisted) errors.push("listing_delisted");
  return {
    ok: errors.length === 0,
    errors,
    nextStage: errors.length === 0 ? "featured" : null,
  };
}

export function advanceStage(
  listing: Listing,
  creator: CreatorProfile,
  target: LaunchStage,
  now = Date.now(),
  options?: { firstRisingLook?: boolean },
): { listing: Listing; result: StageGateResult } {
  let result: StageGateResult;
  switch (target) {
    case "soft_launch":
      result = canSoftLaunch(listing);
      break;
    case "rising_eligible":
      result = canBecomeRisingEligible(listing, creator, now, options);
      break;
    case "featured_eligible":
      result = canBecomeFeaturedEligible(listing, creator, now);
      break;
    case "featured":
      result = canBecomeFeatured(listing);
      break;
    default:
      result = { ok: false, errors: ["invalid_target"], nextStage: null };
  }

  if (!result.ok || !result.nextStage) {
    return { listing, result };
  }

  const updated: Listing = {
    ...listing,
    stage: result.nextStage,
    softLaunchedAt:
      result.nextStage === "soft_launch" ? now : listing.softLaunchedAt,
    risingEligibleAt:
      result.nextStage === "rising_eligible" ? now : listing.risingEligibleAt,
    featuredAt: result.nextStage === "featured" ? now : listing.featuredAt,
  };

  return { listing: updated, result };
}

/** Where a listing may appear given its stage. */
export function visibilityForStage(stage: LaunchStage): {
  profile: boolean;
  openLane: boolean;
  rising: boolean;
  featured: boolean;
} {
  switch (stage) {
    case "draft":
      return { profile: false, openLane: false, rising: false, featured: false };
    case "soft_launch":
      return { profile: true, openLane: true, rising: false, featured: false };
    case "rising_eligible":
      return { profile: true, openLane: true, rising: true, featured: false };
    case "featured_eligible":
      return { profile: true, openLane: true, rising: true, featured: false };
    case "featured":
      return { profile: true, openLane: true, rising: true, featured: true };
  }
}

/** Collection feed: hero + sample set only until traction. */
export function collectionFeedSurface(
  heroId: string | null,
  sampleIds: string[],
  allListingIds: string[],
  hasTraction: boolean,
): string[] {
  if (hasTraction) return allListingIds;
  const samples = sampleIds.slice(0, DISCOVERY_CONFIG.collectionSampleSize);
  const ordered = [heroId, ...samples].filter(
    (id): id is string => !!id && allListingIds.includes(id),
  );
  return [...new Set(ordered)];
}

export function discoveryWeightForType(type: ListingType): number {
  switch (type) {
    case "single":
      return 1.15;
    case "collection":
      return 0.9;
    case "open_edition":
      return 1;
    case "auction":
      return 1;
  }
}
