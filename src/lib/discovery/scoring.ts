import { DISCOVERY_CONFIG } from "./config";
import { isEmergingListing } from "./emerging";
import type { CreatorProfile, Listing, SessionContext } from "./types";

/**
 * score = quality_signal * novelty_boost * diversity_penalty_inverse * spam_risk_inverse
 * with impression decay when fair-share is exceeded.
 */
export function computeQualitySignal(listing: Listing): number {
  const s = listing.signals;
  const dwellMinutes = s.dwellMsTotal / 60_000;
  // Weighted engagement that prefers unique attention over raw clicks.
  return (
    1 +
    s.saves * 3 +
    s.follows * 4 +
    dwellMinutes * 2 +
    s.uniqueViewers * 1.5 +
    s.nominationScore * 2
  );
}

export function computeNoveltyBoost(
  listing: Listing,
  creator: CreatorProfile,
): number {
  const exposure = listing.signals.impressionsThisWeek;
  // Higher when low prior exposure; singles get a slight novelty edge.
  const typeBoost = listing.type === "single" ? 1.15 : 1;
  const exposureFactor = 1 / (1 + Math.log10(1 + exposure));
  const creatorExposurePenalty =
    creator.lifetimePrimaryVolumeUsd > 50_000 ? 0.7 : 1;
  // Established badge is informational only — never a Rising boost.
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

  // Mint / listing velocity proxy.
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
  // Hard decay after fair share captured.
  return 1 / (1 + over * 2);
}

/** Open editions get a time-boxed burst at drop start, then hard decay. */
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
  // Burst in first 15% of window, then decay hard.
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
    computeAuctionEndingBoost(listing, now);

  const score = quality * novelty * diversity * spamInverse * decay * temporal;
  const emerging = isEmergingListing(listing, creator, now);

  const reasons: string[] = [];
  if (emerging.emerging) reasons.push("emerging");
  if (diversity < 1) reasons.push("diversity_penalty");
  if (decay < 0.9) reasons.push("impression_decay");
  if (spamInverse < 0.7) reasons.push("elevated_spam_risk");
  if (listing.type === "open_edition") reasons.push("oe_temporal");
  if (listing.type === "auction") reasons.push("auction_temporal");

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
