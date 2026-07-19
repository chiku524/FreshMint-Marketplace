import { DiscoveryEngine, type MarketplaceState } from "@/lib/discovery";
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
  };
  getMemoryPurchases().push(row);
  return row;
}

export function resetMemoryStoreForTests(): void {
  globalMemory.__freshmintMemoryState = undefined;
  globalMemory.__freshmintMemoryEngine = undefined;
  globalMemory.__freshmintUseMemory = true;
  globalMemory.__freshmintNominations = [];
  globalMemory.__freshmintPurchases = undefined;
}
