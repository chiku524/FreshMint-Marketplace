import { getNetwork, resolveNetwork, type NetworkId } from "@/lib/chains/registry";
import type { Chain } from "@/lib/discovery/types";

/** Hashes that are local/simulated — not on a public explorer. */
export function isExplorableTxHash(hash: string | null | undefined): boolean {
  if (!hash || hash.length < 8) return false;
  const lower = hash.toLowerCase();
  if (
    lower.startsWith("sim-") ||
    lower.startsWith("platform:") ||
    lower.startsWith("pending:") ||
    lower.startsWith("simulated") ||
    lower.startsWith("bridge:") ||
    lower.startsWith("memo")
  ) {
    return false;
  }
  return true;
}

export function txExplorerUrl(input: {
  hash: string | null | undefined;
  network?: NetworkId | string | null;
  chain?: Chain | null;
}): string | null {
  if (!isExplorableTxHash(input.hash)) return null;
  const network = resolveNetwork(input.network, input.chain ?? undefined);
  return getNetwork(network).explorerTx(input.hash!);
}

export function shortTxHash(hash: string, chars = 10): string {
  if (hash.length <= chars + 1) return hash;
  return `${hash.slice(0, chars)}…`;
}
