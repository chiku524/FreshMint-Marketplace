/**
 * On-chain linked NFT↔fungible registry adapter (source of truth).
 *
 * Nico pivot (2026-10-09): display-only metadata is **not** authoritative.
 * FreshMint reads/writes companion links via the Boing L1 registry (SDK helpers).
 * `Collection.linkedTokensJson` is a **cache** of registry state only.
 *
 * SDK surface (boing.network `cursor/linked-nft-token-sdk-277c` / PR #42 pivot):
 * expected exports will land in `boing-sdk` (register / update / unlink / list).
 * Until those helpers ship, prepare/read return `registry_sdk_pending`.
 */

import type { Chain } from "@/lib/discovery/types";
import type { BoingWalletTx } from "@/lib/onchain/wallet-client";
import {
  type LinkedTokenRef,
  serializeLinkedTokens,
  validateLinkedTokensInput,
} from "@/lib/marketplace/linked-tokens";

export type RegistrySyncResult =
  | { ok: true; tokens: LinkedTokenRef[]; registryAddress: string }
  | { ok: false; error: string };

export type RegistryWritePlan =
  | {
      ok: true;
      walletTxs: BoingWalletTx[];
      desired: LinkedTokenRef[];
      registryAddress: string;
    }
  | { ok: false; error: string; errors?: string[] };

/** Canonical registry AccountId when published (env override for testnets). */
export function linkedNftTokenRegistryAddress(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_BOING_LINKED_NFT_TOKEN_REGISTRY?.trim() ||
    process.env.BOING_LINKED_NFT_TOKEN_REGISTRY?.trim() ||
    "";
  return raw || null;
}

export function collectionSupportsOnchainLinkedTokens(chain: Chain): boolean {
  return chain === "boing";
}

/**
 * Try to load SDK registry helpers. Returns null until boing-sdk ships them.
 * Kept dynamic so FreshMint builds without a hard pin while the SDK PR pivots.
 */
type SdkRegistryModule = {
  listLinkedNftTokenPeersForCollection?: (input: {
    registry: string;
    collection: string;
    rpcUrl?: string;
  }) => Promise<string[]>;
  listLinkedNftTokenRegistryPeers?: (input: {
    registry: string;
    collection: string;
    rpcUrl?: string;
  }) => Promise<string[]>;
  buildLinkedNftTokenRegistryLinkTxs?: (input: {
    registry: string;
    collection: string;
    tokens: string[];
    from: string;
  }) => Array<Record<string, unknown>>;
  buildLinkedNftTokenRegistryUpdateTxs?: (input: {
    registry: string;
    collection: string;
    tokens: string[];
    from: string;
  }) => Array<Record<string, unknown>>;
};

/**
 * Optional dependency bridge. Set `BOING_SDK_REGISTRY_MODULE` to a resolvable
 * path/package once SDK registry helpers ship (e.g. `boing-sdk`). Avoids a hard
 * build-time dependency while PR #42 pivots to on-chain registry.
 */
async function loadSdkRegistry(): Promise<null | {
  listPeersForCollection?: SdkRegistryModule["listLinkedNftTokenPeersForCollection"];
  buildLinkTxs?: SdkRegistryModule["buildLinkedNftTokenRegistryLinkTxs"];
}> {
  const spec =
    process.env.BOING_SDK_REGISTRY_MODULE?.trim() ||
    process.env.NEXT_PUBLIC_BOING_SDK_REGISTRY_MODULE?.trim() ||
    "";
  if (!spec) return null;
  try {
    // Dynamic string keeps Next from bundling a missing package at build time.
    const mod = (await Function(
      "s",
      "return import(s)",
    )(spec)) as SdkRegistryModule;
    const list =
      mod.listLinkedNftTokenPeersForCollection ??
      mod.listLinkedNftTokenRegistryPeers;
    const build =
      mod.buildLinkedNftTokenRegistryLinkTxs ??
      mod.buildLinkedNftTokenRegistryUpdateTxs;
    if (!list && !build) return null;
    return { listPeersForCollection: list, buildLinkTxs: build };
  } catch {
    return null;
  }
}

/** Read authoritative peers from the on-chain registry (Boing only). */
export async function readLinkedTokensFromRegistry(input: {
  chain: Chain;
  collectionAddress: string | null | undefined;
  rpcUrl?: string;
}): Promise<RegistrySyncResult> {
  if (!collectionSupportsOnchainLinkedTokens(input.chain)) {
    return { ok: false, error: "registry_boing_only" };
  }
  const registry = linkedNftTokenRegistryAddress();
  if (!registry) {
    return { ok: false, error: "registry_address_unset" };
  }
  const collection = input.collectionAddress?.trim();
  if (!collection) {
    return { ok: false, error: "collection_not_deployed" };
  }

  const sdk = await loadSdkRegistry();
  if (!sdk?.listPeersForCollection) {
    return { ok: false, error: "registry_sdk_pending" };
  }

  try {
    const peers = await sdk.listPeersForCollection({
      registry,
      collection,
      rpcUrl: input.rpcUrl,
    });
    const tokens: LinkedTokenRef[] = (peers ?? []).map((address) => ({
      address,
      label: null,
      chain: "boing" as const,
    }));
    return { ok: true, tokens, registryAddress: registry };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "registry_read_failed",
    };
  }
}

/**
 * Build wallet txs to make on-chain registry match `desiredTokens`.
 * Does **not** write the FreshMint DB — caller confirms after chain acceptance.
 */
export async function planLinkedTokenRegistryWrite(input: {
  chain: Chain;
  collectionAddress: string | null | undefined;
  creatorAddress: string;
  desiredTokens: unknown;
}): Promise<RegistryWritePlan> {
  if (!collectionSupportsOnchainLinkedTokens(input.chain)) {
    return { ok: false, error: "registry_boing_only" };
  }
  const registry = linkedNftTokenRegistryAddress();
  if (!registry) {
    return { ok: false, error: "registry_address_unset" };
  }
  const collection = input.collectionAddress?.trim();
  if (!collection) {
    return { ok: false, error: "collection_not_deployed" };
  }

  const checked = validateLinkedTokensInput(input.desiredTokens, "boing");
  if (!checked.ok) {
    return { ok: false, error: "invalid_tokens", errors: checked.issues };
  }

  const sdk = await loadSdkRegistry();
  if (!sdk?.buildLinkTxs) {
    return { ok: false, error: "registry_sdk_pending" };
  }

  try {
    const rawTxs = sdk.buildLinkTxs({
      registry,
      collection,
      tokens: checked.tokens.map((t) => t.address),
      from: input.creatorAddress,
    });
    const walletTxs: BoingWalletTx[] = rawTxs.map((tx) => ({
      chain: "boing",
      network: "boing",
      method: "boing_sendTransaction",
      tx,
    }));
    return {
      ok: true,
      walletTxs,
      desired: checked.tokens,
      registryAddress: registry,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "registry_plan_failed",
    };
  }
}

export function cachePayloadFromRegistryTokens(tokens: LinkedTokenRef[]): {
  linkedTokensJson: string;
} {
  return { linkedTokensJson: serializeLinkedTokens(tokens) };
}
