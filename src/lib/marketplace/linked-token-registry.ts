/**
 * On-chain linked NFT↔fungible registry adapter (source of truth).
 *
 * Wires FreshMint to boing-sdk registry helpers (vendored from
 * boing.network PR #42 / SHA abf8808 — selectors 0xE0–0xE6, dual claimer).
 * `Collection.linkedTokensJson` is a **cache** of registry state only.
 */

import type { Chain } from "@/lib/discovery/types";
import {
  asRegistryAccountId,
  buildLinkedNftTokenRegisterFlowTxs,
  buildLinkedNftTokenUnlinkAtTx,
  decodeLinkedNftTokenGetLinkAtReturnData,
  decodeLinkedNftTokenLinksCountReturnData,
  encodeLinkedNftTokenGetLinkAtCalldataHex,
  encodeLinkedNftTokenLinksCountCalldataHex,
  LINKED_NFT_TOKEN_REGISTRY_MAX_LINKS,
  type RegistryLinkSlot,
} from "@/lib/onchain/linked-nft-token-registry";
import { simulateBoingContractCall } from "@/lib/onchain/boing";
import type { BoingWalletTx } from "@/lib/onchain/wallet-client";
import {
  type LinkedTokenRef,
  serializeLinkedTokens,
  validateLinkedTokensInput,
} from "@/lib/marketplace/linked-tokens";

export type RegistrySyncResult =
  | { ok: true; tokens: LinkedTokenRef[]; registryAddress: string; slots: RegistryLinkSlot[] }
  | { ok: false; error: string };

export type RegistryWritePlan =
  | {
      ok: true;
      walletTxs: BoingWalletTx[];
      desired: LinkedTokenRef[];
      registryAddress: string;
      /** Human-readable summary of planned claim/register/unlink steps. */
      steps: string[];
    }
  | { ok: false; error: string; errors?: string[] };

/** Canonical registry AccountId when published (env override for testnets). */
export function linkedNftTokenRegistryAddress(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_BOING_LINKED_NFT_TOKEN_REGISTRY?.trim() ||
    process.env.BOING_LINKED_NFT_TOKEN_REGISTRY?.trim() ||
    "";
  if (!raw) return null;
  return asRegistryAccountId(raw);
}

export function collectionSupportsOnchainLinkedTokens(chain: Chain): boolean {
  return chain === "boing";
}

function toWalletTx(tx: Record<string, unknown>): BoingWalletTx {
  return {
    chain: "boing",
    network: "boing",
    method: "boing_sendTransaction",
    tx,
  };
}

/** Preserve display labels from prior cache / desired draft when re-reading chain. */
export function mergeLinkedTokenLabels(
  registryTokens: LinkedTokenRef[],
  ...labelSources: Array<LinkedTokenRef[] | undefined | null>
): LinkedTokenRef[] {
  const labels = new Map<string, string>();
  for (const source of labelSources) {
    if (!source) continue;
    for (const t of source) {
      const key = t.address.trim().toLowerCase();
      const label = t.label?.trim();
      if (key && label) labels.set(key, label);
    }
  }
  return registryTokens.map((t) => {
    const label = labels.get(t.address.trim().toLowerCase()) ?? t.label ?? null;
    return { ...t, label };
  });
}

async function simulateReturnData(
  registry: string,
  calldata: string,
  sender?: string | null,
): Promise<string> {
  const sim = await simulateBoingContractCall({
    contract: registry,
    calldata,
    sender: sender ?? null,
  });
  if (!sim.success) {
    throw new Error(sim.error ?? "registry_simulate_failed");
  }
  return (sim.return_data ?? "0x").trim();
}

/**
 * Scan registry slots for active (collection, token) edges.
 * Tombstones (zero pair) are skipped; indices stay stable after unlink.
 */
export async function listRegistryLinkSlots(input: {
  registry: string;
  collection: string;
  sender?: string | null;
}): Promise<RegistryLinkSlot[]> {
  const registry = asRegistryAccountId(input.registry);
  const collection = asRegistryAccountId(input.collection);
  if (!registry || !collection) {
    throw new Error("invalid_registry_or_collection");
  }

  const countRaw = await simulateReturnData(
    registry,
    encodeLinkedNftTokenLinksCountCalldataHex(),
    input.sender,
  );
  const countBn = decodeLinkedNftTokenLinksCountReturnData(countRaw);
  const count = Number(
    countBn > BigInt(LINKED_NFT_TOKEN_REGISTRY_MAX_LINKS)
      ? LINKED_NFT_TOKEN_REGISTRY_MAX_LINKS
      : countBn,
  );

  const slots: RegistryLinkSlot[] = [];
  for (let i = 0; i < count; i++) {
    const raw = await simulateReturnData(
      registry,
      encodeLinkedNftTokenGetLinkAtCalldataHex(i),
      input.sender,
    );
    const decoded = decodeLinkedNftTokenGetLinkAtReturnData(raw);
    if (!decoded.active) continue;
    if (decoded.collectionHex.toLowerCase() !== collection.toLowerCase()) {
      continue;
    }
    slots.push({
      index: i,
      collectionHex: decoded.collectionHex,
      tokenHex: decoded.tokenHex,
    });
  }
  return slots;
}

/** Read authoritative peers from the on-chain registry (Boing only). */
export async function readLinkedTokensFromRegistry(input: {
  chain: Chain;
  collectionAddress: string | null | undefined;
  rpcUrl?: string;
  sender?: string | null;
  /** Optional label hints (cache / draft) merged onto registry peers. */
  labelHints?: LinkedTokenRef[] | null;
}): Promise<RegistrySyncResult> {
  void input.rpcUrl;
  if (!collectionSupportsOnchainLinkedTokens(input.chain)) {
    return { ok: false, error: "registry_boing_only" };
  }
  const registry = linkedNftTokenRegistryAddress();
  if (!registry) {
    return { ok: false, error: "registry_address_unset" };
  }
  const collection = asRegistryAccountId(input.collectionAddress ?? undefined);
  if (!collection) {
    return { ok: false, error: "collection_not_deployed" };
  }

  try {
    const slots = await listRegistryLinkSlots({
      registry,
      collection,
      sender: input.sender,
    });
    // Dedupe tokens (re-register after unlink can leave duplicates historically).
    const seen = new Set<string>();
    const tokens: LinkedTokenRef[] = [];
    for (const slot of slots) {
      const address = slot.tokenHex.toLowerCase();
      if (seen.has(address)) continue;
      seen.add(address);
      tokens.push({ address, label: null, chain: "boing" });
    }
    return {
      ok: true,
      tokens: mergeLinkedTokenLabels(tokens, input.labelHints),
      registryAddress: registry,
      slots,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "registry_read_failed",
    };
  }
}

/**
 * Build wallet txs so on-chain registry matches `desiredTokens`.
 * - New tokens → claim×2 + register_link (SDK `buildLinkedNftTokenRegisterFlowTxs`)
 * - Removed tokens → unlink_at(index) per active slot
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
  const collection = asRegistryAccountId(input.collectionAddress ?? undefined);
  if (!collection) {
    return { ok: false, error: "collection_not_deployed" };
  }
  const sender = asRegistryAccountId(input.creatorAddress);
  if (!sender) {
    return { ok: false, error: "invalid_creator_address" };
  }

  const checked = validateLinkedTokensInput(input.desiredTokens, "boing");
  if (!checked.ok) {
    return { ok: false, error: "invalid_tokens", errors: checked.issues };
  }

  // Official registry is Boing AccountIds only.
  for (const t of checked.tokens) {
    if (t.chain && t.chain !== "boing") {
      return {
        ok: false,
        error: "registry_boing_only",
        errors: ["registry_boing_only"],
      };
    }
  }

  try {
    const slots = await listRegistryLinkSlots({
      registry,
      collection,
      sender,
    });
    const currentByToken = new Map<string, number[]>();
    for (const slot of slots) {
      const key = slot.tokenHex.toLowerCase();
      const list = currentByToken.get(key) ?? [];
      list.push(slot.index);
      currentByToken.set(key, list);
    }

    const desiredKeys = new Set(
      checked.tokens.map((t) => t.address.trim().toLowerCase()),
    );

    const walletTxs: BoingWalletTx[] = [];
    const steps: string[] = [];

    // Unlink first (tombstone). Highest index first for readability only — slots don't shift.
    const unlinkIndices: number[] = [];
    for (const [token, indices] of currentByToken) {
      if (!desiredKeys.has(token)) {
        unlinkIndices.push(...indices);
      }
    }
    unlinkIndices.sort((a, b) => b - a);
    for (const index of unlinkIndices) {
      walletTxs.push(
        toWalletTx(
          buildLinkedNftTokenUnlinkAtTx({
            senderHex32: sender,
            registryHex32: registry,
            index,
          }),
        ),
      );
      steps.push(`unlink_at(${index})`);
    }

    for (const token of checked.tokens) {
      const key = token.address.trim().toLowerCase();
      if (currentByToken.has(key)) continue;
      const flow = buildLinkedNftTokenRegisterFlowTxs({
        senderHex32: sender,
        registryHex32: registry,
        collectionHex32: collection,
        tokenHex32: key,
      });
      for (const tx of flow) {
        walletTxs.push(toWalletTx(tx));
      }
      steps.push(`claim×2+register_link(${key.slice(0, 10)}…)`);
    }

    return {
      ok: true,
      walletTxs,
      desired: checked.tokens,
      registryAddress: registry,
      steps,
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
