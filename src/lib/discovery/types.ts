/** Shared domain types for the fair-discovery marketplace. */

export type Chain = "evm" | "solana";

export type ListingType = "single" | "collection" | "open_edition" | "auction";

/** Lifecycle stages from the plan: Draft → Soft launch → Rising → Featured. */
export type LaunchStage =
  | "draft"
  | "soft_launch"
  | "rising_eligible"
  | "featured_eligible"
  | "featured";

export type ReportReason =
  | "spam"
  | "stolen_art"
  | "duplicate"
  | "policy_violation"
  | "other";

export type AppealStatus = "none" | "pending" | "approved" | "rejected";

export interface CreatorProfile {
  id: string;
  displayName: string;
  /** Linked wallets across EVM + Solana (unified identity). */
  wallets: { chain: Chain; address: string }[];
  firstListingAt: number | null;
  lifetimePrimaryVolumeUsd: number;
  completedSales: number;
  flagged: boolean;
  washCluster: boolean;
  verifiedCreator: boolean;
  walletCreatedAt: number;
  risingEntriesThisWeek: number;
  openLaneListingsToday: number;
  curatorScore: number;
  establishedBadge: boolean;
}

export interface ListingSignals {
  saves: number;
  follows: number;
  dwellMsTotal: number;
  uniqueViewers: number;
  impressionsToday: number;
  impressionsThisWeek: number;
  reportRate: number;
  nominationScore: number;
}

export interface Listing {
  id: string;
  title: string;
  description: string;
  creatorId: string;
  type: ListingType;
  chain: Chain;
  stage: LaunchStage;
  priceUsd: number | null;
  medium: string;
  styleTags: string[];
  /** Perceptual / content hash for duplicate detection. */
  mediaHash: string;
  metadataComplete: boolean;
  originalMedia: boolean;
  createdAt: number;
  softLaunchedAt: number | null;
  risingEligibleAt: number | null;
  featuredAt: number | null;
  /** Open edition drop window. */
  oeStartsAt: number | null;
  oeEndsAt: number | null;
  /** Auction window. */
  auctionStartsAt: number | null;
  auctionEndsAt: number | null;
  collectionId: string | null;
  isCollectionHero: boolean;
  signals: ListingSignals;
  delisted: boolean;
  appealStatus: AppealStatus;
}

export interface Collection {
  id: string;
  title: string;
  creatorId: string;
  chain: Chain;
  heroListingId: string | null;
  sampleListingIds: string[];
  totalItems: number;
}

export interface Shelf {
  id: string;
  name: string;
  curatorId: string;
  listingIds: string[];
  followerIds: string[];
}

export interface FollowGraph {
  collectorId: string;
  followedArtistIds: string[];
  followedCollectorIds: string[];
  followedShelfIds: string[];
}

export interface Report {
  id: string;
  listingId: string;
  reporterId: string;
  reason: ReportReason;
  createdAt: number;
  resolved: boolean;
}

export interface Appeal {
  id: string;
  listingId: string;
  creatorId: string;
  message: string;
  createdAt: number;
  status: AppealStatus;
}

export interface SessionContext {
  viewerId: string | null;
  /** Artist IDs already shown in this session (diversity). */
  seenArtistIds: string[];
  /** Listing IDs already shown. */
  seenListingIds: string[];
  /** Collection IDs already shown this session. */
  seenCollectionIds: string[];
  itemsOnCurrentScreen: { artistId: string; collectionId: string | null }[];
}

export type FeedBucket =
  | "emerging_rising"
  | "following"
  | "featured"
  | "auctions_live";

export interface RankedListing {
  listing: Listing;
  score: number;
  bucket: FeedBucket | "rising" | "open" | "featured";
  emerging: boolean;
  reasons: string[];
}

export interface MetricEvent {
  type:
    | "impression"
    | "meaningful_view"
    | "first_purchase"
    | "purchase"
    | "report"
    | "duplicate_blocked"
    | "rising_abuse";
  listingId?: string;
  creatorId?: string;
  viewerId?: string;
  emerging?: boolean;
  bucket?: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}
