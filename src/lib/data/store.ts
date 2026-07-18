import { DiscoveryEngine } from "@/lib/discovery";
import { buildSeedState } from "./seed";

const globalForStore = globalThis as unknown as {
  __discoveryEngine?: DiscoveryEngine;
};

export function getEngine(): DiscoveryEngine {
  if (!globalForStore.__discoveryEngine) {
    globalForStore.__discoveryEngine = new DiscoveryEngine(buildSeedState());
  }
  return globalForStore.__discoveryEngine;
}

export function resetEngine(): DiscoveryEngine {
  globalForStore.__discoveryEngine = new DiscoveryEngine(buildSeedState());
  return globalForStore.__discoveryEngine;
}
