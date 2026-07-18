import { DiscoveryEngine } from "@/lib/discovery";
import { getDiscoveryEngine } from "@/lib/marketplace/service";

/** @deprecated Prefer getDiscoveryEngine() for DB-backed state. */
export async function getEngine(): Promise<DiscoveryEngine> {
  return getDiscoveryEngine();
}
