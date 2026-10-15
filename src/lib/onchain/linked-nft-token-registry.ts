/**
 * Vendored helpers from boing-sdk `linkedNftTokenRegistry.ts`
 * (boing.network PR #42 / SHA abf8808, branch cursor/linked-nft-token-sdk-277c).
 *
 * Selectors 0xE0–0xE6; dual asset-claimer auth. Encode / decode / build
 * Express `contract_call` txs for FreshMint companion-token UI.
 */

import {
  isBoingNativeAccountIdHex,
  normalizeBoingAccountId,
} from "@/lib/onchain/boing";

/** `claim_asset(asset)` — 64 bytes. */
export const SELECTOR_LINKED_NFT_TOKEN_CLAIM_ASSET = 0xe0;
/** `register_link(collection, token)` — 96 bytes. */
export const SELECTOR_LINKED_NFT_TOKEN_REGISTER_LINK = 0xe1;
/** `unlink_at(index)` — 64 bytes. */
export const SELECTOR_LINKED_NFT_TOKEN_UNLINK_AT = 0xe2;
/** `links_count` — 32 bytes. */
export const SELECTOR_LINKED_NFT_TOKEN_LINKS_COUNT = 0xe3;
/** `get_link_at(index)` — 64 bytes; returns 64 bytes. */
export const SELECTOR_LINKED_NFT_TOKEN_GET_LINK_AT = 0xe4;
/** `get_asset_claimer(asset)` — 64 bytes. */
export const SELECTOR_LINKED_NFT_TOKEN_GET_ASSET_CLAIMER = 0xe5;
/** `transfer_asset_claimer(asset, new_claimer)` — 96 bytes. */
export const SELECTOR_LINKED_NFT_TOKEN_TRANSFER_ASSET_CLAIMER = 0xe6;

export const LINKED_NFT_TOKEN_REGISTRY_MAX_LINKS = 4096;

const HEX_RE = /^[0-9a-fA-F]+$/;
const ZERO32 = `0x${"0".repeat(64)}`;

function ensureHex(value: string): string {
  const t = value.trim();
  if (!t.startsWith("0x") && !t.startsWith("0X")) return `0x${t}`;
  return t;
}

function validateHex32(value: string): string {
  const h = ensureHex(value).toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(h)) {
    throw new Error(`expected 32-byte hex AccountId, got ${value}`);
  }
  return h;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "0x";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const h = ensureHex(hex).slice(2);
  if (h.length % 2 !== 0 || !HEX_RE.test(h)) {
    throw new Error("invalid hex");
  }
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function selectorWord(selector: number): Uint8Array {
  const w = new Uint8Array(32);
  w[31] = selector & 0xff;
  return w;
}

function u64Word(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > Number.MAX_SAFE_INTEGER) {
    throw new RangeError("index must be a non-negative safe integer");
  }
  const w = new Uint8Array(32);
  new DataView(w.buffer).setBigUint64(24, BigInt(n), false);
  return w;
}

function concatWords(parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function normalizeCalldataHex(calldataHex: string): string {
  const h = ensureHex(calldataHex.trim());
  const raw = h.slice(2);
  if (raw.length % 2 !== 0) throw new Error("calldata must be even-length hex");
  if (!HEX_RE.test(raw)) throw new Error("calldata: invalid hex");
  return `0x${raw.toLowerCase()}`;
}

export function encodeLinkedNftTokenClaimAssetCalldataHex(
  assetHex32: string,
): string {
  return bytesToHex(
    concatWords([
      selectorWord(SELECTOR_LINKED_NFT_TOKEN_CLAIM_ASSET),
      hexToBytes(validateHex32(assetHex32)),
    ]),
  );
}

export function encodeLinkedNftTokenRegisterLinkCalldataHex(
  collectionHex32: string,
  tokenHex32: string,
): string {
  return bytesToHex(
    concatWords([
      selectorWord(SELECTOR_LINKED_NFT_TOKEN_REGISTER_LINK),
      hexToBytes(validateHex32(collectionHex32)),
      hexToBytes(validateHex32(tokenHex32)),
    ]),
  );
}

export function encodeLinkedNftTokenUnlinkAtCalldataHex(index: number): string {
  return bytesToHex(
    concatWords([
      selectorWord(SELECTOR_LINKED_NFT_TOKEN_UNLINK_AT),
      u64Word(index),
    ]),
  );
}

export function encodeLinkedNftTokenLinksCountCalldataHex(): string {
  return bytesToHex(selectorWord(SELECTOR_LINKED_NFT_TOKEN_LINKS_COUNT));
}

export function encodeLinkedNftTokenGetLinkAtCalldataHex(
  index: number,
): string {
  return bytesToHex(
    concatWords([
      selectorWord(SELECTOR_LINKED_NFT_TOKEN_GET_LINK_AT),
      u64Word(index),
    ]),
  );
}

export function encodeLinkedNftTokenGetAssetClaimerCalldataHex(
  assetHex32: string,
): string {
  return bytesToHex(
    concatWords([
      selectorWord(SELECTOR_LINKED_NFT_TOKEN_GET_ASSET_CLAIMER),
      hexToBytes(validateHex32(assetHex32)),
    ]),
  );
}

export function encodeLinkedNftTokenTransferAssetClaimerCalldataHex(
  assetHex32: string,
  newClaimerHex32: string,
): string {
  return bytesToHex(
    concatWords([
      selectorWord(SELECTOR_LINKED_NFT_TOKEN_TRANSFER_ASSET_CLAIMER),
      hexToBytes(validateHex32(assetHex32)),
      hexToBytes(validateHex32(newClaimerHex32)),
    ]),
  );
}

export function buildLinkedNftTokenRegistryAccessList(
  senderHex32: string,
  registryHex32: string,
): { read: string[]; write: string[] } {
  const s = validateHex32(senderHex32).toLowerCase();
  const r = validateHex32(registryHex32).toLowerCase();
  return { read: [s, r], write: [s, r] };
}

export type LinkedNftTokenRegistryContractCallTx = {
  type: "contract_call";
  contract: string;
  calldata: string;
  access_list: { read: string[]; write: string[] };
};

export function buildLinkedNftTokenRegistryContractCallTx(
  senderHex32: string,
  registryHex32: string,
  calldataHex: string,
): LinkedNftTokenRegistryContractCallTx {
  return {
    type: "contract_call",
    contract: validateHex32(registryHex32).toLowerCase(),
    calldata: normalizeCalldataHex(calldataHex),
    access_list: buildLinkedNftTokenRegistryAccessList(
      senderHex32,
      registryHex32,
    ),
  };
}

/** Decode `links_count` return word → u64 slot count (includes tombstones). */
export function decodeLinkedNftTokenLinksCountReturnData(
  returnDataHex: string,
): bigint {
  const raw = ensureHex(returnDataHex).slice(2).toLowerCase();
  if (!HEX_RE.test(raw) || raw.length < 2) {
    throw new Error("links_count return data: invalid hex");
  }
  const padded = raw.padStart(64, "0").slice(-64);
  return BigInt(`0x${padded}`) & 0xffff_ffff_ffff_ffffn;
}

export function decodeLinkedNftTokenGetLinkAtReturnData(returnDataHex: string): {
  collectionHex: string;
  tokenHex: string;
  /** False when both ids are zero (tombstone / unlinked slot). */
  active: boolean;
} {
  const raw = ensureHex(returnDataHex).slice(2).toLowerCase();
  if (!HEX_RE.test(raw)) throw new Error("get_link_at return data: invalid hex");
  if (raw.length < 128) {
    throw new Error(
      "get_link_at return data: expected 64 bytes (128 hex chars)",
    );
  }
  const collectionHex = validateHex32(`0x${raw.slice(0, 64)}`);
  const tokenHex = validateHex32(`0x${raw.slice(64, 128)}`);
  return {
    collectionHex,
    tokenHex,
    active: collectionHex !== ZERO32 && tokenHex !== ZERO32,
  };
}

/**
 * Build Express `contract_call` txs to claim both assets and register one edge.
 * Caller must be (or become) claimer of both AccountIds — typically the deployer.
 */
export function buildLinkedNftTokenRegisterFlowTxs(input: {
  senderHex32: string;
  registryHex32: string;
  collectionHex32: string;
  tokenHex32: string;
}): LinkedNftTokenRegistryContractCallTx[] {
  const { senderHex32, registryHex32, collectionHex32, tokenHex32 } = input;
  return [
    buildLinkedNftTokenRegistryContractCallTx(
      senderHex32,
      registryHex32,
      encodeLinkedNftTokenClaimAssetCalldataHex(collectionHex32),
    ),
    buildLinkedNftTokenRegistryContractCallTx(
      senderHex32,
      registryHex32,
      encodeLinkedNftTokenClaimAssetCalldataHex(tokenHex32),
    ),
    buildLinkedNftTokenRegistryContractCallTx(
      senderHex32,
      registryHex32,
      encodeLinkedNftTokenRegisterLinkCalldataHex(collectionHex32, tokenHex32),
    ),
  ];
}

export function buildLinkedNftTokenUnlinkAtTx(input: {
  senderHex32: string;
  registryHex32: string;
  index: number;
}): LinkedNftTokenRegistryContractCallTx {
  return buildLinkedNftTokenRegistryContractCallTx(
    input.senderHex32,
    input.registryHex32,
    encodeLinkedNftTokenUnlinkAtCalldataHex(input.index),
  );
}

export type RegistryLinkSlot = {
  index: number;
  collectionHex: string;
  tokenHex: string;
};

/** Normalize a Boing AccountId for registry calldata; null if invalid. */
export function asRegistryAccountId(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const n = normalizeBoingAccountId(value);
  return isBoingNativeAccountIdHex(n) ? n : null;
}
