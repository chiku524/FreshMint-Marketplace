import { DISCOVERY_CONFIG } from "./config";
import type {
  Appeal,
  AppealStatus,
  CreatorProfile,
  Listing,
  Report,
  ReportReason,
} from "./types";

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  remaining?: number;
}

export function checkOpenLaneRateLimit(creator: CreatorProfile): RateLimitResult {
  const max = DISCOVERY_CONFIG.openLaneListingsPerCreatorPerDay;
  if (creator.openLaneListingsToday >= max) {
    return {
      allowed: false,
      reason: "open_lane_daily_cap",
      remaining: 0,
    };
  }
  return {
    allowed: true,
    remaining: max - creator.openLaneListingsToday,
  };
}

export function checkRisingRateLimit(creator: CreatorProfile): RateLimitResult {
  const max = DISCOVERY_CONFIG.risingEntriesPerCreatorPerWeek;
  if (creator.risingEntriesThisWeek >= max) {
    return {
      allowed: false,
      reason: "rising_weekly_cap",
      remaining: 0,
    };
  }
  return {
    allowed: true,
    remaining: max - creator.risingEntriesThisWeek,
  };
}

export function checkNewWalletCooldown(
  creator: CreatorProfile,
  now = Date.now(),
): RateLimitResult {
  const elapsed = now - creator.walletCreatedAt;
  const need = DISCOVERY_CONFIG.newWalletRisingCooldownMs;
  if (elapsed < need) {
    return {
      allowed: false,
      reason: "new_wallet_cooldown",
      remaining: need - elapsed,
    };
  }
  return { allowed: true };
}

/** Hamming-like distance on hex media hashes for near-duplicate detection. */
export function mediaHashDistance(a: string, b: string): number {
  const len = Math.max(a.length, b.length);
  let dist = Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) dist += 1;
  }
  return dist / Math.max(len, 1);
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchedListingId?: string;
  distance?: number;
}

export function findNearDuplicate(
  mediaHash: string,
  existing: Listing[],
  threshold = 0.12,
): DuplicateCheckResult {
  for (const listing of existing) {
    if (listing.delisted) continue;
    if (listing.mediaHash === mediaHash) {
      return {
        isDuplicate: true,
        matchedListingId: listing.id,
        distance: 0,
      };
    }
    const distance = mediaHashDistance(mediaHash, listing.mediaHash);
    if (distance <= threshold) {
      return {
        isDuplicate: true,
        matchedListingId: listing.id,
        distance,
      };
    }
  }
  return { isDuplicate: false };
}

export function validateListingQuality(listing: Pick<
  Listing,
  "title" | "description" | "mediaHash" | "metadataComplete" | "originalMedia"
>): string[] {
  const errors: string[] = [];
  if (!listing.title?.trim()) errors.push("title_required");
  if (!listing.mediaHash) errors.push("media_required");
  if (!listing.metadataComplete) errors.push("metadata_incomplete");
  if (!listing.originalMedia) errors.push("original_media_required");
  if ((listing.description?.length ?? 0) > 0 && listing.description.length < 8) {
    errors.push("description_too_short");
  }
  return errors;
}

export function createReport(input: {
  id: string;
  listingId: string;
  reporterId: string;
  reason: ReportReason;
  now?: number;
}): Report {
  return {
    id: input.id,
    listingId: input.listingId,
    reporterId: input.reporterId,
    reason: input.reason,
    createdAt: input.now ?? Date.now(),
    resolved: false,
  };
}

/**
 * Rapid delist when report pressure is high or reason is stolen art.
 * Returns updated listing + whether delisted.
 */
export function applyReportPressure(
  listing: Listing,
  reports: Report[],
): { listing: Listing; delisted: boolean; reason?: string } {
  const open = reports.filter((r) => r.listingId === listing.id && !r.resolved);
  const stolen = open.some((r) => r.reason === "stolen_art");
  const spamCount = open.filter((r) => r.reason === "spam").length;
  const total = open.length;

  let delisted = listing.delisted;
  let reason: string | undefined;

  if (stolen || spamCount >= 3 || total >= 5) {
    delisted = true;
    reason = stolen
      ? "stolen_art"
      : spamCount >= 3
        ? "spam_threshold"
        : "report_threshold";
  }

  const reportRate =
    listing.signals.uniqueViewers > 0
      ? total / Math.max(listing.signals.uniqueViewers, 1)
      : total > 0
        ? 1
        : listing.signals.reportRate;

  return {
    listing: {
      ...listing,
      delisted,
      signals: { ...listing.signals, reportRate },
      appealStatus: delisted ? "none" : listing.appealStatus,
    },
    delisted,
    reason,
  };
}

export function submitAppeal(input: {
  id: string;
  listingId: string;
  creatorId: string;
  message: string;
  now?: number;
}): Appeal {
  return {
    id: input.id,
    listingId: input.listingId,
    creatorId: input.creatorId,
    message: input.message,
    createdAt: input.now ?? Date.now(),
    status: "pending",
  };
}

export function resolveAppeal(
  listing: Listing,
  appeal: Appeal,
  status: Exclude<AppealStatus, "none" | "pending">,
): { listing: Listing; appeal: Appeal } {
  const restored = status === "approved";
  return {
    appeal: { ...appeal, status },
    listing: {
      ...listing,
      delisted: restored ? false : listing.delisted,
      appealStatus: status,
      signals: {
        ...listing.signals,
        reportRate: restored ? 0 : listing.signals.reportRate,
      },
    },
  };
}

export interface NominationResult {
  ok: boolean;
  error?: string;
  curatorScoreDelta: number;
  listing?: Listing;
  curator?: CreatorProfile;
}

/** Collector nomination stake into Rising / featured path. */
export function nominateListing(
  listing: Listing,
  curator: CreatorProfile,
): NominationResult {
  if (listing.delisted) {
    return { ok: false, error: "listing_delisted", curatorScoreDelta: 0 };
  }
  if (listing.stage === "draft") {
    return { ok: false, error: "not_discoverable", curatorScoreDelta: 0 };
  }
  if (curator.curatorScore < DISCOVERY_CONFIG.nominationStakePoints) {
    return { ok: false, error: "insufficient_curator_score", curatorScoreDelta: 0 };
  }

  const stake = DISCOVERY_CONFIG.nominationStakePoints;
  return {
    ok: true,
    curatorScoreDelta: -stake,
    listing: {
      ...listing,
      signals: {
        ...listing.signals,
        nominationScore: listing.signals.nominationScore + 1,
      },
    },
    curator: {
      ...curator,
      curatorScore: curator.curatorScore - stake,
    },
  };
}

export function settleNominationOutcome(
  curator: CreatorProfile,
  outcome: "success" | "abuse",
): CreatorProfile {
  const delta =
    outcome === "success"
      ? DISCOVERY_CONFIG.nominationRewardPoints
      : -DISCOVERY_CONFIG.nominationPenaltyPoints;
  return {
    ...curator,
    curatorScore: Math.max(0, curator.curatorScore + delta),
  };
}
