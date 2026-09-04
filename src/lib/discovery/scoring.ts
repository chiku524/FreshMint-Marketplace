import { DISCOVERY_CONFIG } from "./config";
import { isEmergingListing } from "./emerging";
import { discoveryWeightForType } from "./staging";
import type { CreatorProfile, Listing, SessionContext } from "./types";

function bayesianRate(
  successes: number,
  trials: number,
  prior: number,
  priorN: number,
): number {
  const s = Math.max(0, successes);
  const n = Math.max(0, trials);
  return (s + prior * priorN) / (n + priorN);
}

/**
 * Rate-based quality with a Bayesian prior.
 * High-impression / low-rate work cannot outrank small, real attention.
 */
export function computeQualitySignal(listing: Listing): number {
  const s = listing.signals;
  const n = Math.max(s.uniqueViewers, 0);
  const q = DISCOVERY_CONFIG.quality;
  const priorN = q.priorUniqueViewers;

  const saveRate = bayesianRate(s.saves, n, q.priorSaveRate, priorN);
  const followRate = bayesianRate(s.follows, n, q.priorFollowRate, priorN);
  const meaningfulApprox =
    s.dwellMsTotal / DISCOVERY_CONFIG.meaningfulViewDwellMs;
  const dwellRate = bayesianRate(
    meaningfulApprox,
    n,
    q.priorMeaningfulViewRate,
    priorN,
  );
  const nomRate = bayesianRate(
    s.nominationScore,
    n,
    q.priorNominationRate,
    priorN,
  );

  let saveW = 4;
  let followW = 5;
  if (n < DISCOVERY_CONFIG.sybil.minUniqueViewersForSaveTrust) {
    saveW *= 0.35;
    followW *= 0.35;
  }

  return 1 + saveRate * saveW + followRate * followW + dwellRate * 3 + nomRate * 2.5;
}

export function computeNoveltyBoost(
  listing: Listing,
  creator: CreatorProfile,
): number {
  const exposure = listing.signals.impressionsThisWeek;
  const typeBoost = discoveryWeightForType(listing.type);
  const exposureFactor = 1 / (1 + Math.log10(1 + exposure));
  const creatorExposurePenalty =
    creator.lifetimePrimaryVolumeUsd > 50_000 ? 0.7 : 1;
  return typeBoost * exposureFactor * creatorExposurePenalty;
}

export function computeDiversityPenaltyInverse(
  listing: Listing,
  session: SessionContext,
): number {
  if (session.seenArtistIds.includes(listing.creatorId)) return 0.35;
  if (
    listing.collectionId &&
    session.seenCollectionIds.includes(listing.collectionId)
  ) {
    return 0.5;
  }
  const onScreen = session.itemsOnCurrentScreen.filter(
    (i) => i.artistId === listing.creatorId,
  ).length;
  if (onScreen >= DISCOVERY_CONFIG.maxArtistPerScreen) return 0.05;
  return 1;
}

export function computeSpamRiskInverse(
  listing: Listing,
  creator: CreatorProfile,
  now = Date.now(),
): number {
  let risk = 0;
  risk += listing.signals.reportRate * 5;
  if (creator.flagged) risk += 2;
  if (creator.washCluster) risk += 3;

  const walletAgeDays =
    (now - creator.walletCreatedAt) / (24 * 60 * 60 * 1000);
  if (walletAgeDays < 3) risk += 1.2;
  else if (walletAgeDays < 14) risk += 0.4;

  if (creator.openLaneListingsToday > 15) risk += 1;
  if (creator.risingEntriesThisWeek >= DISCOVERY_CONFIG.risingEntriesPerCreatorPerWeek) {
    risk += 0.8;
  }

  return 1 / (1 + risk);
}

export function computeImpressionDecay(listing: Listing): number {
  const dayShare = DISCOVERY_CONFIG.impressionFairSharePerDay;
  const weekShare = DISCOVERY_CONFIG.impressionFairSharePerWeek;
  const dayRatio = listing.signals.impressionsToday / dayShare;
  const weekRatio = listing.signals.impressionsThisWeek / weekShare;
  const over = Math.max(0, dayRatio - 1) + Math.max(0, weekRatio - 1) * 0.5;
  return 1 / (1 + over * 2);
}

export function computeOpenEditionTemporalBoost(
  listing: Listing,
  now = Date.now(),
): number {
  if (listing.type !== "open_edition") return 1;
  if (listing.oeStartsAt == null || listing.oeEndsAt == null) return 0.4;
  if (now < listing.oeStartsAt || now > listing.oeEndsAt) return 0.25;

  const window = listing.oeEndsAt - listing.oeStartsAt;
  const elapsed = now - listing.oeStartsAt;
  const progress = window <= 0 ? 1 : elapsed / window;
  if (progress <= 0.15) return 1.8;
  if (progress <= 0.4) return 1.1;
  return 0.35;
}

export function computeAuctionEndingBoost(
  listing: Listing,
  now = Date.now(),
): number {
  if (listing.type !== "auction" || listing.auctionEndsAt == null) return 1;
  const msLeft = listing.auctionEndsAt - now;
  if (msLeft <= 0) return 0.1;
  const hoursLeft = msLeft / (60 * 60 * 1000);
  if (hoursLeft <= 1) return 1.6;
  if (hoursLeft <= 6) return 1.25;
  return 1;
}

/** Short look-window for newly Rising-eligible singles/collections. */
export function computeRisingAgeBoost(
  listing: Listing,
  now = Date.now(),
): number {
  if (listing.type === "open_edition" || listing.type === "auction") return 1;
  if (listing.risingEligibleAt == null) return 1;
  const age = now - listing.risingEligibleAt;
  const { burstMs, burstBoost, tailMs, tailBoost, agedBoost } =
    DISCOVERY_CONFIG.risingAge;
  if (age <= burstMs) return burstBoost;
  if (age <= tailMs) return tailBoost;
  return agedBoost;
}

export interface ScoreBreakdown {
  score: number;
  quality: number;
  novelty: number;
  diversity: number;
  spamInverse: number;
  decay: number;
  temporal: number;
  emerging: boolean;
  reasons: string[];
}

export function scoreListing(
  listing: Listing,
  creator: CreatorProfile,
  session: SessionContext,
  now = Date.now(),
): ScoreBreakdown {
  const quality = computeQualitySignal(listing);
  const novelty = computeNoveltyBoost(listing, creator);
  const diversity = computeDiversityPenaltyInverse(listing, session);
  const spamInverse = computeSpamRiskInverse(listing, creator, now);
  const decay = computeImpressionDecay(listing);
  const temporal =
    computeOpenEditionTemporalBoost(listing, now) *
    computeAuctionEndingBoost(listing, now) *
    computeRisingAgeBoost(listing, now);

  const score = quality * novelty * diversity * spamInverse * decay * temporal;
  const emerging = isEmergingListing(listing, creator, now);

  const reasons: string[] = [];
  if (emerging.emerging) reasons.push("emerging");
  if (diversity < 1) reasons.push("diversity_penalty");
  if (decay < 0.9) reasons.push("impression_decay");
  if (spamInverse < 0.7) reasons.push("elevated_spam_risk");
  if (listing.type === "open_edition") reasons.push("oe_temporal");
  if (listing.type === "auction") reasons.push("auction_temporal");
  if (temporal > 1.05 && listing.type !== "open_edition" && listing.type !== "auction") {
    reasons.push("rising_age_burst");
  }

  return {
    score,
    quality,
    novelty,
    diversity,
    spamInverse,
    decay,
    temporal,
    emerging: emerging.emerging,
    reasons: [...reasons, ...emerging.reasons],
  };
}
