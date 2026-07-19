import { toListing } from "@/lib/data/mappers";
import { prisma } from "@/lib/db";
import { ensureDatabaseReady } from "@/lib/db-ready";
import { isMemoryMode, getMemoryPurchases, getMemoryState } from "@/lib/data/memory-store";
import type { Listing, NetworkId } from "@/lib/discovery/types";

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
  wallets: ProfileWallet[];
  created: Listing[];
  owned: Array<{
    purchaseId: string;
    purchasedAt: number;
    amountUsd: number;
    txHash: string | null;
    listing: Listing;
  }>;
  shelves: ProfileShelf[];
  bridges: ProfileBridge[];
};

export async function getUserAssetProfile(
  userId: string,
): Promise<UserAssetProfile | null> {
  const mode = await ensureDatabaseReady();
  const memory = mode === "memory" || isMemoryMode();

  if (memory) {
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

    const { getMemoryTotp } = await import("@/lib/auth/totp");
    const totp = getMemoryTotp(userId);

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
      totpEnabled: totp.totpEnabled,
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
}
