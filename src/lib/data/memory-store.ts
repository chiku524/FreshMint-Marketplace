import { DiscoveryEngine, type MarketplaceState } from "@/lib/discovery";
import { buildSeedState } from "@/lib/data/seed";

const globalMemory = globalThis as unknown as {
  __freshmintMemoryState?: MarketplaceState;
  __freshmintMemoryEngine?: DiscoveryEngine;
  __freshmintUseMemory?: boolean;
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
