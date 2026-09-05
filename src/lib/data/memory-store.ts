import { DiscoveryEngine, type MarketplaceState } from "@/lib/discovery";
import type { Chain, CreatorProfile, NetworkId } from "@/lib/discovery/types";
import { buildSeedState } from "@/lib/data/seed";

export type MemoryNomination = {
  id: string;
  listingId: string;
  nominatorId: string;
  stakePoints: number;
  createdAt: number;
  outcome: string | null;
};

export type MemoryPurchase = {
  id: string;
  listingId: string;
  buyerId: string;
  amountUsd: number;
  feeTotalUsd?: number;
  feeTreasuryUsd?: number;
  feeOperatorUsd?: number;
  sellerNetUsd?: number;
  soldAt: number;
  txHash: string | null;
  chain: string;
  withdrawTxHash?: string | null;
  withdrawAddress?: string | null;
  withdrawnAt?: number | null;
};

const globalMemory = globalThis as unknown as {
  __freshmintMemoryState?: MarketplaceState;
  __freshmintMemoryEngine?: DiscoveryEngine;
  __freshmintUseMemory?: boolean;
  __freshmintNominations?: MemoryNomination[];
  __freshmintPurchases?: MemoryPurchase[];
};

export function enableMemoryMode(reason: string): void {
  if (!globalMemory.__freshmintUseMemory) {
    console.warn(
      `[freshmint] Postgres unavailable (${reason}) — serving in-memory catalog`,
    );
  }
  globalMemory.__freshmintUseMemory = true;
}

export function isMemoryMode(): boolean {
  return Boolean(globalMemory.__freshmintUseMemory);
}

export function getMemoryState(): MarketplaceState {
  if (!globalMemory.__freshmintMemoryState) {
    globalMemory.__freshmintMemoryState = buildSeedState();
  }
  return globalMemory.__freshmintMemoryState;
}

export function getMemoryEngine(): DiscoveryEngine {
  if (!globalMemory.__freshmintMemoryEngine) {
    globalMemory.__freshmintMemoryEngine = new DiscoveryEngine(getMemoryState());
  }
  // Keep engine.state pointing at the live map
  globalMemory.__freshmintMemoryEngine.state = getMemoryState();
  return globalMemory.__freshmintMemoryEngine;
}

export function getMemoryNominations(): MemoryNomination[] {
  if (!globalMemory.__freshmintNominations) {
    globalMemory.__freshmintNominations = [];
  }
  return globalMemory.__freshmintNominations;
}

function seedMemoryPurchases(): MemoryPurchase[] {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  return [
    {
      id: "purchase-mem-sold-1",
      listingId: "listing-fresh-sold-auction",
      buyerId: "collector-mira",
      amountUsd: 180,
      soldAt: now - 2 * day,
      txHash: "0xsoldfresh001",
      chain: "evm",
    },
    {
      id: "purchase-mem-sold-2",
      listingId: "listing-glitch-sold-auction",
      buyerId: "collector-mira",
      amountUsd: 95,
      soldAt: now - 6 * day,
      txHash: "soldglitch002",
      chain: "solana",
    },
  ];
}

export function getMemoryPurchases(): MemoryPurchase[] {
  if (!globalMemory.__freshmintPurchases) {
    globalMemory.__freshmintPurchases = seedMemoryPurchases();
  }
  return globalMemory.__freshmintPurchases;
}

export function recordMemoryPurchase(
  purchase: Omit<MemoryPurchase, "id"> & { id?: string },
): MemoryPurchase {
  const row: MemoryPurchase = {
    id: purchase.id ?? `purchase-mem-${Date.now()}`,
    listingId: purchase.listingId,
    buyerId: purchase.buyerId,
    amountUsd: purchase.amountUsd,
    feeTotalUsd: purchase.feeTotalUsd,
    feeTreasuryUsd: purchase.feeTreasuryUsd,
    feeOperatorUsd: purchase.feeOperatorUsd,
    sellerNetUsd: purchase.sellerNetUsd,
    soldAt: purchase.soldAt,
    txHash: purchase.txHash,
    chain: purchase.chain,
    withdrawTxHash: purchase.withdrawTxHash ?? null,
    withdrawAddress: purchase.withdrawAddress ?? null,
    withdrawnAt: purchase.withdrawnAt ?? null,
  };
  getMemoryPurchases().push(row);
  return row;
}

export function updateMemoryPurchase(
  purchaseId: string,
  patch: Partial<MemoryPurchase>,
): MemoryPurchase | null {
  const rows = getMemoryPurchases();
  const index = rows.findIndex((p) => p.id === purchaseId);
  if (index < 0) return null;
  rows[index] = { ...rows[index], ...patch };
  return rows[index];
}

/** Keep signed-in wallet/email users in the in-memory catalog so /me and buys work. */
export function ensureMemoryCreator(input: {
  id: string;
  displayName: string;
  wallets?: { chain: string; address: string; network?: string | null }[];
  curatorScore?: number;
  verifiedCreator?: boolean;
  establishedBadge?: boolean;
  completedSales?: number;
  lifetimePrimaryVolumeUsd?: number;
}): CreatorProfile {
  const state = getMemoryState();
  const existing = state.creators.get(input.id);
  if (existing) {
    if (input.wallets?.length) {
      const seen = new Set(
        existing.wallets.map((w) => `${w.chain}:${w.address.toLowerCase()}`),
      );
      for (const wallet of input.wallets) {
        const key = `${wallet.chain}:${wallet.address.toLowerCase()}`;
        if (seen.has(key)) continue;
        existing.wallets.push({
          chain: wallet.chain as Chain,
          address: wallet.address,
          network: (wallet.network as NetworkId | null) ?? null,
        });
        seen.add(key);
      }
    }
    return existing;
  }
  const created: CreatorProfile = {
    id: input.id,
    displayName: input.displayName,
    wallets: (input.wallets ?? []).map((w) => ({
      chain: w.chain as Chain,
      address: w.address,
      network: (w.network as NetworkId | null) ?? null,
    })),
    firstListingAt: null,
    lifetimePrimaryVolumeUsd: input.lifetimePrimaryVolumeUsd ?? 0,
    completedSales: input.completedSales ?? 0,
    flagged: false,
    washCluster: false,
    verifiedCreator: input.verifiedCreator ?? false,
    walletCreatedAt: Date.now(),
    risingEntriesThisWeek: 0,
    openLaneListingsToday: 0,
    curatorScore: input.curatorScore ?? 25,
    establishedBadge: input.establishedBadge ?? false,
  };
  state.creators.set(input.id, created);
  return created;
}

export function resetMemoryStoreForTests(): void {
  globalMemory.__freshmintMemoryState = undefined;
  globalMemory.__freshmintMemoryEngine = undefined;
  globalMemory.__freshmintUseMemory = true;
  globalMemory.__freshmintNominations = [];
  globalMemory.__freshmintPurchases = undefined;
  const accounts = globalThis as unknown as { __freshmintAccounts?: Map<string, unknown> };
  accounts.__freshmintAccounts = undefined;
}
