import { toListing } from "@/lib/data/mappers";
import { prisma } from "@/lib/db";
import { isPostgresConfigured } from "@/lib/env";
import {
  ensureMemoryCreator,
  getMemoryPurchases,
  getMemoryState,
} from "@/lib/data/memory-store";
import type { Listing, NetworkId } from "@/lib/discovery/types";
import { nftAssetKey, type WalletNft } from "@/lib/wallet/inventory";
import type { SessionUser } from "@/lib/auth/session";

export type ProfileWallet = {
  chain: string;
  network: string | null;
  address: string;
};

export type ProfileShelf = {
  id: string;
  name: string;
  listingIds: string[];
  followerCount: number;
};

export type ProfileBridge = {
  id: string;
  fromNetwork: string;
  toNetwork: string;
  amount: string;
  status: string;
  createdAt: number;
};

export type UserAssetProfile = {
  userId: string;
  displayName: string;
  role: string;
  curatorScore: number;
  verifiedCreator: boolean;
  establishedBadge: boolean;
  completedSales: number;
  lifetimePrimaryVolumeUsd: number;
  totpEnabled: boolean;
  email: string | null;
  googleLinked: boolean;
  hasPassword: boolean;
  avatarUrl: string | null;
  wallets: ProfileWallet[];
  created: Listing[];
  owned: Array<{
    purchaseId: string;
    purchasedAt: number;
    amountUsd: number;
    txHash: string | null;
    withdrawTxHash?: string | null;
    withdrawnAt?: number | null;
    listing: Listing;
  }>;
  shelves: ProfileShelf[];
  bridges: ProfileBridge[];
};

function profileFromMemoryCreator(userId: string): UserAssetProfile | null {
  const state = getMemoryState();
  const creator = state.creators.get(userId);
  if (!creator) return null;
  const created = [...state.listings.values()].filter(
    (l) => l.creatorId === userId,
  );
  const purchases = getMemoryPurchases().filter((p) => p.buyerId === userId);
  const owned = purchases
    .map((p) => {
      const listing = state.listings.get(p.listingId);
      if (!listing) return null;
      return {
        purchaseId: p.id,
        purchasedAt: p.soldAt,
        amountUsd: p.amountUsd,
        txHash: p.txHash,
        withdrawTxHash: p.withdrawTxHash ?? null,
        withdrawnAt: p.withdrawnAt ?? null,
        listing,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const shelves = [...state.shelves.values()]
    .filter((s) => s.curatorId === userId)
    .map((s) => ({
      id: s.id,
      name: s.name,
      listingIds: s.listingIds,
      followerCount: s.followerIds.length,
    }));

  return {
    userId,
    displayName: creator.displayName,
    role: userId.startsWith("mod-")
      ? "moderator"
      : userId.startsWith("curator-")
        ? "editor"
        : "member",
    curatorScore: creator.curatorScore,
    verifiedCreator: creator.verifiedCreator,
    establishedBadge: creator.establishedBadge,
    completedSales: creator.completedSales,
    lifetimePrimaryVolumeUsd: creator.lifetimePrimaryVolumeUsd,
    totpEnabled: false,
    email: null,
    googleLinked: false,
    hasPassword: false,
    avatarUrl: null,
    wallets: creator.wallets.map((w) => ({
      chain: w.chain,
      network: (w.network as NetworkId | null) ?? null,
      address: w.address,
    })),
    created,
    owned,
    shelves,
    bridges: [],
  };
}

export function profileFromSession(user: SessionUser): UserAssetProfile {
  ensureMemoryCreator({
    id: user.id,
    displayName: user.displayName,
    wallets: user.wallets,
    curatorScore: user.curatorScore,
    verifiedCreator: user.verifiedCreator,
    establishedBadge: user.establishedBadge,
    completedSales: user.completedSales,
    lifetimePrimaryVolumeUsd: user.lifetimePrimaryVolumeUsd,
  });
  return (
    profileFromMemoryCreator(user.id) ?? {
      userId: user.id,
      displayName: user.displayName,
      role: user.role,
      curatorScore: user.curatorScore,
      verifiedCreator: user.verifiedCreator,
      establishedBadge: user.establishedBadge,
      completedSales: user.completedSales,
      lifetimePrimaryVolumeUsd: user.lifetimePrimaryVolumeUsd,
      totpEnabled: user.totpEnabled,
      email: user.email,
      googleLinked: user.googleLinked,
      hasPassword: user.hasPassword,
      avatarUrl: user.avatarUrl,
      wallets: user.wallets.map((w) => ({
        chain: w.chain,
        network: null,
        address: w.address,
      })),
      created: [],
      owned: [],
      shelves: [],
      bridges: [],
    }
  );
}

async function profileFromPrisma(
  userId: string,
): Promise<UserAssetProfile | null> {
  if (!isPostgresConfigured()) return null;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        wallets: true,
        listings: { orderBy: { createdAt: "desc" } },
        purchases: {
          orderBy: { createdAt: "desc" },
          include: { listing: true },
        },
        shelves: {
          include: {
            items: { orderBy: { position: "asc" } },
            followers: true,
          },
        },
        bridgeTransfers: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!user) return null;

    return {
      userId: user.id,
      displayName: user.displayName,
      role: user.role,
      curatorScore: user.curatorScore,
      verifiedCreator: user.verifiedCreator,
      establishedBadge: user.establishedBadge,
      completedSales: user.completedSales,
      lifetimePrimaryVolumeUsd: user.lifetimePrimaryVolumeUsd,
      totpEnabled: user.totpEnabled,
      email: user.email,
      googleLinked: Boolean(user.googleId),
      hasPassword: Boolean(user.passwordHash),
      avatarUrl: user.avatarUrl,
      wallets: user.wallets.map((w) => ({
        chain: w.chain,
        network: w.network,
        address: w.address,
      })),
      created: user.listings.map(toListing),
      owned: user.purchases.map((p) => ({
        purchaseId: p.id,
        purchasedAt: p.createdAt.getTime(),
        amountUsd: p.amountUsd,
        txHash: p.txHash,
        withdrawTxHash: p.withdrawTxHash,
        withdrawnAt: p.withdrawnAt?.getTime() ?? null,
        listing: toListing(p.listing),
      })),
      shelves: user.shelves.map((s) => ({
        id: s.id,
        name: s.name,
        listingIds: s.items.map((i) => i.listingId),
        followerCount: s.followers.length,
      })),
      bridges: user.bridgeTransfers.map((b) => ({
        id: b.id,
        fromNetwork: b.fromNetwork,
        toNetwork: b.toNetwork,
        amount: b.amount,
        status: b.status,
        createdAt: b.createdAt.getTime(),
      })),
    };
  } catch {
    return null;
  }
}

export async function getUserAssetProfile(
  userId: string,
): Promise<UserAssetProfile | null> {
  const fromDb = await profileFromPrisma(userId);
  if (fromDb) return fromDb;

  const fromMemory = profileFromMemoryCreator(userId);
  if (fromMemory) {
    const { getMemoryTotp } = await import("@/lib/auth/totp");
    const { getMemoryAccount } = await import("@/lib/auth/account");
    const totp = getMemoryTotp(userId);
    const account = getMemoryAccount(userId);
    return {
      ...fromMemory,
      totpEnabled: totp.totpEnabled,
      email: account?.email ?? null,
      googleLinked: Boolean(account?.googleId),
      hasPassword: Boolean(account?.passwordHash),
      avatarUrl: account?.avatarUrl ?? null,
    };
  }
  return null;
}

/** Marketplace listings that match on-chain tokens held in linked wallets. */
export async function findListingsByWalletNfts(
  nfts: WalletNft[],
): Promise<Listing[]> {
  if (nfts.length === 0) return [];
  const wanted = new Set(
    nfts.map((nft) => nftAssetKey(nft.chain, nft.contractAddress, nft.tokenId)),
  );
  const match = (listing: Listing) => {
    if (!listing.contractAddress || listing.tokenId == null) return false;
    return wanted.has(
      nftAssetKey(listing.chain, listing.contractAddress, listing.tokenId),
    );
  };

  if (isPostgresConfigured()) {
    try {
      const listings = await prisma.listing.findMany({
        where: {
          contractAddress: { not: null },
          tokenId: { not: null },
        },
        take: 400,
      });
      const found = listings.map(toListing).filter(match);
      if (found.length > 0) return found;
    } catch {
      // fall through to memory catalog
    }
  }

  return [...getMemoryState().listings.values()].filter(match);
}
