/**
 * Collection ↔ fungible token link shapes (FreshMint).
 *
 * **Source of truth:** Boing L1 on-chain linked-pair registry (SDK helpers).
 * `Collection.linkedTokensJson` is a **cache** only — see `linked-token-registry.ts`.
 *
 * Many-to-many, mutable, authorized owners only. Display-only metadata MVP
 * (`boing.linked_nft_token.v1` soft-gate) is **superseded** / non-authoritative.
 */

import { isAddress } from "viem";
import { isBoingNativeAccountIdHex, normalizeBoingAccountId } from "@/lib/onchain/boing";
import { isValidSolanaAddress } from "@/lib/onchain/solana";
import type { Chain } from "@/lib/discovery/types";

export const LINKED_TOKEN_LABEL_MAX = 64;
export const LINKED_NFT_TOKEN_SCHEMA = "boing.linked_nft_token.v1" as const;

export type LinkedTokenRef = {
  /** On-chain fungible contract / mint / Boing AccountId */
  address: string;
  /** Optional short display label (symbol or project token name) */
  label?: string | null;
  /** Defaults to the collection chain when omitted */
  chain?: Chain | null;
};

export type LinkedTokenIssue =
  | "invalid_json"
  | "not_array"
  | "invalid_entry"
  | "invalid_address"
  | "invalid_label"
  | "invalid_chain"
  | "duplicate_address";

const CHAINS: readonly Chain[] = ["evm", "solana", "boing"];

export function isChain(value: unknown): value is Chain {
  return typeof value === "string" && (CHAINS as readonly string[]).includes(value);
}

export function normalizeTokenAddress(
  raw: string,
  chain: Chain,
): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  if (chain === "evm") {
    if (!isAddress(t)) return null;
    return t.toLowerCase();
  }
  if (chain === "boing") {
    // Accept 0X… / mixed-case hex; store canonical lowercase AccountId.
    const normalized = normalizeBoingAccountId(t);
    if (!isBoingNativeAccountIdHex(normalized)) return null;
    return normalized;
  }
  if (chain === "solana") {
    if (!isValidSolanaAddress(t)) return null;
    return t;
  }
  return null;
}

export function parseLinkedTokensJson(
  raw: string | null | undefined,
): LinkedTokenRef[] {
  if (raw == null || String(raw).trim() === "") return [];
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: LinkedTokenRef[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const address = typeof row.address === "string" ? row.address.trim() : "";
      if (!address) continue;
      const label =
        typeof row.label === "string" && row.label.trim()
          ? row.label.trim().slice(0, LINKED_TOKEN_LABEL_MAX)
          : null;
      const chain = isChain(row.chain) ? row.chain : null;
      out.push({ address, label, chain });
    }
    return out;
  } catch {
    return [];
  }
}

export function serializeLinkedTokens(tokens: LinkedTokenRef[]): string {
  return JSON.stringify(
    tokens.map((t) => {
      const row: { address: string; label?: string; chain?: Chain } = {
        address: t.address,
      };
      if (t.label) row.label = t.label;
      if (t.chain) row.chain = t.chain;
      return row;
    }),
  );
}

/**
 * Validate and normalize a full replacement list for a collection.
 * Dedupes by normalized address (case-folded for EVM/Boing). No size cap.
 */
export function validateLinkedTokensInput(
  input: unknown,
  defaultChain: Chain,
):
  | { ok: true; tokens: LinkedTokenRef[] }
  | { ok: false; issues: LinkedTokenIssue[] } {
  if (input === undefined || input === null) {
    return { ok: true, tokens: [] };
  }
  if (!Array.isArray(input)) {
    return { ok: false, issues: ["not_array"] };
  }

  const issues: LinkedTokenIssue[] = [];
  const tokens: LinkedTokenRef[] = [];
  const seen = new Set<string>();

  for (const item of input) {
    if (!item || typeof item !== "object") {
      issues.push("invalid_entry");
      continue;
    }
    const row = item as Record<string, unknown>;
    const chainRaw = row.chain;
    let chain: Chain = defaultChain;
    if (chainRaw !== undefined && chainRaw !== null && chainRaw !== "") {
      if (!isChain(chainRaw)) {
        issues.push("invalid_chain");
        continue;
      }
      chain = chainRaw;
    }

    const addressRaw = typeof row.address === "string" ? row.address : "";
    const address = normalizeTokenAddress(addressRaw, chain);
    if (!address) {
      issues.push("invalid_address");
      continue;
    }

    let label: string | null = null;
    if (row.label !== undefined && row.label !== null && row.label !== "") {
      if (typeof row.label !== "string") {
        issues.push("invalid_label");
        continue;
      }
      const trimmed = row.label.trim();
      if (trimmed.length > LINKED_TOKEN_LABEL_MAX) {
        issues.push("invalid_label");
        continue;
      }
      label = trimmed || null;
    }

    const dedupeKey = `${chain}:${address.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      issues.push("duplicate_address");
      continue;
    }
    seen.add(dedupeKey);
    tokens.push({
      address,
      label,
      chain: chain === defaultChain ? null : chain,
    });
  }

  if (issues.length) return { ok: false, issues };
  return { ok: true, tokens };
}

/** Shorten addresses for UI chips. */
export function shortTokenAddress(address: string, chars = 6): string {
  const a = address.trim();
  if (a.length <= chars * 2 + 3) return a;
  return `${a.slice(0, chars + (a.startsWith("0x") ? 2 : 0))}…${a.slice(-chars)}`;
}

/**
 * Documented convention payload (for SDK / finance interoperability).
 * FreshMint does not write this on-chain in the MVP; encode helpers live in boing-sdk.
 */
export type LinkedNftTokenSchemaV1 = {
  schema: typeof LINKED_NFT_TOKEN_SCHEMA;
  /** Collection AccountId / contract */
  collection: string;
  /** Linked fungible AccountIds / contracts (many) */
  tokens: string[];
};
