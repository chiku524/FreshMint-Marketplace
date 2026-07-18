/**
 * Locked product constants from the fair-discovery plan.
 * Emerging quota and attention budgets are enforced in code, not marketing copy.
 */

export const DISCOVERY_CONFIG = {
  /** Homepage Rising daily slot budget (rotated). */
  risingSlotsPerDay: 36,

  /** Featured fixed daily inventory. */
  featuredSlotsPerDay: 12,

  /**
   * Minimum share of Rising slots reserved for Emerging artists.
   * Plan: 30–40%; we lock at 40% and enforce in the ranker.
   */
  emergingRisingQuota: 0.4,

  /** Concurrent open-edition launches allowed on Rising. */
  maxConcurrentOeOnRising: 3,

  /** Live auction strip capacity on homepage. */
  liveAuctionStripSlots: 6,

  /** Max Rising entries per creator wallet/profile per week. */
  risingEntriesPerCreatorPerWeek: 3,

  /** Softer Open Lane listing cap per creator per day (profile unlimited for own page). */
  openLaneListingsPerCreatorPerDay: 25,

  /** Collection feed surface: hero + samples until traction. */
  collectionSampleSize: 3,

  /** New-wallet cooldown before Rising eligibility (ms). */
  newWalletRisingCooldownMs: 72 * 60 * 60 * 1000,

  /** Soft reputation stake cost for a Rising nomination (points). */
  nominationStakePoints: 10,

  /** Nomination reward when the work earns meaningful engagement. */
  nominationRewardPoints: 15,

  /** Penalty when a nomination is marked spam/abuse. */
  nominationPenaltyPoints: 25,

  /** Impression fair-share before hard decay kicks in (per day). */
  impressionFairSharePerDay: 2_000,

  /** Weekly impression fair-share before additional decay. */
  impressionFairSharePerWeek: 8_000,

  /**
   * Emerging eligibility (OR of thresholds, AND not flagged/wash).
   * Locked game-resistant defaults.
   */
  emerging: {
    maxLifetimePrimaryVolumeUsd: 5_000,
    maxCompletedSales: 10,
    maxDaysSinceFirstListing: 90,
  },

  /**
   * Homepage / personalized feed mix (must sum to 1).
   * 40% Emerging Rising · 25% Following · 20% Featured · 15% Auctions/live
   */
  feedMix: {
    emerging_rising: 0.4,
    following: 0.25,
    featured: 0.2,
    auctions_live: 0.15,
  } as const,

  /** Diversity: max items from one artist per screen. */
  maxArtistPerScreen: 1,

  /** Diversity: max items from one collection per session window. */
  maxCollectionFloodPerSession: 2,

  /** Metadata / quality gates for Rising. */
  risingGates: {
    requireMetadataComplete: true,
    requireOriginalMedia: true,
    requireNotFlagged: true,
    requireNotDelisted: true,
  },

  /** Meaningful view threshold (ms dwell). */
  meaningfulViewDwellMs: 3_000,
} as const;

export type FeedMixKey = keyof typeof DISCOVERY_CONFIG.feedMix;
