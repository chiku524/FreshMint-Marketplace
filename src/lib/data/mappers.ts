import type {
  Collection as DbCollection,
  Listing as DbListing,
  Shelf as DbShelf,
  User as DbUser,
  Wallet as DbWallet,
} from "@/generated/prisma/client";
import { resolveNetwork } from "@/lib/chains/registry";
import type {
  Collection,
  CreatorProfile,
  Listing,
  ListingSignals,
  NetworkId,
  Shelf,
} from "@/lib/discovery/types";

type UserWithWallets = DbUser & { wallets: DbWallet[] };

export function toCreatorProfile(user: UserWithWallets): CreatorProfile {
  return {
    id: user.id,
    displayName: user.displayName,
    wallets: user.wallets.map((w) => ({
      chain: w.chain as "evm" | "solana",
      address: w.address,
      network: (w.network as NetworkId | null) ?? null,
    })),
    firstListingAt: user.firstListingAt?.getTime() ?? null,
    lifetimePrimaryVolumeUsd: user.lifetimePrimaryVolumeUsd,
    completedSales: user.completedSales,
    flagged: user.flagged,
    washCluster: user.washCluster,
    verifiedCreator: user.verifiedCreator,
    walletCreatedAt: user.walletCreatedAt.getTime(),
    risingEntriesThisWeek: user.risingEntriesThisWeek,
    openLaneListingsToday: user.openLaneListingsToday,
    curatorScore: user.curatorScore,
    establishedBadge: user.establishedBadge,
  };
}

function signalsFromListing(listing: DbListing): ListingSignals {
  return {
    saves: listing.saves,
    follows: listing.follows,
    dwellMsTotal: listing.dwellMsTotal,
    uniqueViewers: listing.uniqueViewers,
    impressionsToday: listing.impressionsToday,
    impressionsThisWeek: listing.impressionsThisWeek,
    reportRate: listing.reportRate,
    nominationScore: listing.nominationScore,
  };
}

export function toListing(listing: DbListing): Listing {
  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    creatorId: listing.creatorId,
    type: listing.type as Listing["type"],
    chain: listing.chain as Listing["chain"],
    network: resolveNetwork(
      listing.network,
      listing.chain as Listing["chain"],
    ),
    stage: listing.stage as Listing["stage"],
    priceUsd: listing.priceUsd,
    medium: listing.medium,
    styleTags: JSON.parse(listing.styleTagsJson || "[]") as string[],
    mediaHash: listing.mediaHash,
    mediaUrl: listing.mediaUrl,
    metadataComplete: listing.metadataComplete,
    originalMedia: listing.originalMedia,
    createdAt: listing.createdAt.getTime(),
    softLaunchedAt: listing.softLaunchedAt?.getTime() ?? null,
    risingEligibleAt: listing.risingEligibleAt?.getTime() ?? null,
    featuredAt: listing.featuredAt?.getTime() ?? null,
    oeStartsAt: listing.oeStartsAt?.getTime() ?? null,
    oeEndsAt: listing.oeEndsAt?.getTime() ?? null,
    auctionStartsAt: listing.auctionStartsAt?.getTime() ?? null,
    auctionEndsAt: listing.auctionEndsAt?.getTime() ?? null,
    collectionId: listing.collectionId,
    isCollectionHero: listing.isCollectionHero,
    signals: signalsFromListing(listing),
    delisted: listing.delisted,
    appealStatus: listing.appealStatus as Listing["appealStatus"],
    mintTxHash: listing.mintTxHash,
    contractAddress: listing.contractAddress,
    tokenId: listing.tokenId,
  };
}

export function toCollection(c: DbCollection): Collection {
  return {
    id: c.id,
    title: c.title,
    creatorId: c.creatorId,
    chain: c.chain as Collection["chain"],
    heroListingId: c.heroListingId,
    sampleListingIds: JSON.parse(c.sampleIdsJson || "[]") as string[],
    totalItems: c.totalItems,
  };
}

export function toShelf(
  shelf: DbShelf & {
    items: { listingId: string }[];
    followers: { followerId: string }[];
  },
): Shelf {
  return {
    id: shelf.id,
    name: shelf.name,
    curatorId: shelf.curatorId,
    listingIds: shelf.items.map((i) => i.listingId),
    followerIds: shelf.followers.map((f) => f.followerId),
  };
}
