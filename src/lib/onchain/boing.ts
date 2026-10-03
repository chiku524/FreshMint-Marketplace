import { createHash, randomBytes } from "node:crypto";
import { blake3 } from "@noble/hashes/blake3";
import { marketAddressFor, rpcUrlFor } from "@/lib/chains/registry";
import type { MintIntent } from "./evm";
import { DEFAULT_REFERENCE_NFT_COLLECTION_TEMPLATE_BYTECODE_HEX } from "./boing-artifacts/defaultReferenceNftCollectionTemplateBytecodeHex";

export const BOING_TESTNET_CHAIN_ID = 6913;
export const BOING_TESTNET_CHAIN_ID_HEX = "0x1b01";

/** Official pinned NFT collection template (`boing-execution` / `boing-sdk`). */
export const REFERENCE_NFT_COLLECTION_TEMPLATE_ARTIFACT_ID =
  "boing.reference_nft_collection.v0";
export const REFERENCE_NFT_COLLECTION_TEMPLATE_VERSION = "1";

const QA_PLACEHOLDER_DESCRIPTION_HASH = `0x${"00".repeat(32)}`;

/** Reference NFT selectors — last byte of the first 32-byte word. */
export const SELECTOR_OWNER_OF = 0x03;
export const SELECTOR_TRANSFER_NFT = 0x04;
export const SELECTOR_SET_METADATA_HASH = 0x05;

/**
 * XOR mask for owner slot — mirrors `REF_NFT_OWNER_STORAGE_XOR` in
 * `boing-execution` / `boing-sdk` (`BOING_REFNFT_OWNER01` + zero pad).
 */
export const REF_NFT_OWNER_STORAGE_XOR_HEX =
  "0x424f494e475f5245464e46545f4f574e45523031000000000000000000000000";

export function isBoingNativeAccountIdHex(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value.trim());
}

export function normalizeBoingAccountId(address: string): string {
  const raw = address.trim();
  const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return raw.toLowerCase();
  return `0x${hex.toLowerCase()}`;
}

/** Normalize a Boing token id to a 32-byte `0x`-prefixed hex word. */
export function normalizeBoingTokenIdWord(tokenId: string): string | null {
  const raw = tokenId.trim();
  if (!raw) return null;
  if (/^0x[0-9a-fA-F]{64}$/.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return `0x${raw.toLowerCase()}`;
  // Sequential / decimal ids → big-endian u64 in the low 8 bytes.
  if (/^\d+$/.test(raw)) {
    try {
      let n = BigInt(raw);
      if (n < 0n) return null;
      const out = Buffer.alloc(32);
      for (let i = 31; i >= 24; i--) {
        out[i] = Number(n & 0xffn);
        n >>= 8n;
      }
      if (n !== 0n) return null;
      return `0x${out.toString("hex")}`;
    } catch {
      return null;
    }
  }
  return null;
}

/** Provisional FreshMint placeholder — not a real on-chain Boing AccountId. */
export function provisionalBoingCollectionAddress(collectionId: string): string {
  return `0x${createHash("sha256")
    .update(`boing-col:${collectionId}`)
    .digest("hex")
    .slice(0, 64)}`;
}

export function isProvisionalBoingCollectionAddress(
  collectionId: string,
  address: string | null | undefined,
): boolean {
  if (!address) return true;
  if (address.startsWith("pending:")) return true;
  if (!isBoingNativeAccountIdHex(address)) return true;
  return (
    normalizeBoingAccountId(address) ===
    provisionalBoingCollectionAddress(collectionId)
  );
}

/** `SLOAD` key for reference NFT owner: `token_id ^ REF_NFT_OWNER_STORAGE_XOR`. */
export function referenceNftOwnerStorageKey(tokenIdHex32: string): string {
  const tokenId = normalizeBoingTokenIdWord(tokenIdHex32);
  if (!tokenId) throw new Error("boing_token_id_invalid");
  const a = Buffer.from(tokenId.slice(2), "hex");
  const b = Buffer.from(REF_NFT_OWNER_STORAGE_XOR_HEX.slice(2), "hex");
  const out = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) out[i] = a[i]! ^ b[i]!;
  return `0x${out.toString("hex")}`;
}

export function ensure0xHex(hex: string): `0x${string}` {
  const t = hex.trim();
  if (!t) throw new Error("empty_hex");
  return (t.startsWith("0x") || t.startsWith("0X") ? t : `0x${t}`) as `0x${string}`;
}

/** Official template, or `BOING_REFERENCE_NFT_COLLECTION_TEMPLATE_BYTECODE_HEX` override. */
export function resolveBoingNftCollectionBytecode(): `0x${string}` {
  const override = process.env.BOING_REFERENCE_NFT_COLLECTION_TEMPLATE_BYTECODE_HEX;
  if (override?.trim()) return ensure0xHex(override);
  return DEFAULT_REFERENCE_NFT_COLLECTION_TEMPLATE_BYTECODE_HEX;
}

export interface BoingWalletTx {
  chain: "boing";
  network: "boing";
  chainId: number;
  method: "boing_sendTransaction";
  tx: Record<string, unknown>;
}

async function boingRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(rpcUrlFor("boing"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  if (!res.ok) {
    // Cloudflare / gateway HTML challenges often return non-JSON bodies.
    throw new Error(`boing_rpc_http_${res.status}`);
  }
  let body: { result?: T; error?: { message?: string; code?: number } };
  try {
    body = JSON.parse(text) as {
      result?: T;
      error?: { message?: string; code?: number };
    };
  } catch {
    throw new Error("boing_rpc_non_json");
  }
  if (body.error) {
    throw new Error(body.error.message ?? `boing_rpc_${method}`);
  }
  return body.result as T;
}

export async function getBoingAccount(accountId: string): Promise<{
  balance: string;
  nonce: number;
  stake: string;
} | null> {
  try {
    const id = normalizeBoingAccountId(accountId);
    if (!isBoingNativeAccountIdHex(id)) return null;
    const acct = await boingRpc<{
      balance?: string;
      nonce?: number;
      stake?: string;
    }>("boing_getAccount", [id]);
    return {
      balance: acct.balance ?? "0",
      nonce: Number(acct.nonce ?? 0),
      stake: acct.stake ?? "0",
    };
  } catch {
    return null;
  }
}

/** Native BOING balance (whole-unit u128 decimal string). */
export async function getBoingNativeBalance(
  accountId: string,
): Promise<{ balance: string; ok: true } | { balance: null; ok: false; error: string }> {
  const id = normalizeBoingAccountId(accountId);
  if (!isBoingNativeAccountIdHex(id)) {
    return { balance: null, ok: false, error: "invalid_boing_account" };
  }
  try {
    const result = await boingRpc<{ balance?: string }>("boing_getBalance", [id]);
    return { balance: result.balance ?? "0", ok: true };
  } catch (e) {
    // Fall back to getAccount — same truth, slightly heavier.
    try {
      const acct = await getBoingAccount(id);
      if (acct) return { balance: acct.balance, ok: true };
    } catch {
      /* ignore */
    }
    return {
      balance: null,
      ok: false,
      error: e instanceof Error ? e.message : "boing_balance_unavailable",
    };
  }
}

export async function getBoingContractStorage(
  contractId: string,
  storageKey: string,
): Promise<string | null> {
  try {
    const contract = normalizeBoingAccountId(contractId);
    const key = storageKey.startsWith("0x") ? storageKey : `0x${storageKey}`;
    if (!isBoingNativeAccountIdHex(contract) || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
      return null;
    }
    const result = await boingRpc<{ value?: string }>("boing_getContractStorage", [
      contract,
      key.toLowerCase(),
    ]);
    const value = result.value?.trim();
    if (!value) return null;
    return value.startsWith("0x") ? value.toLowerCase() : `0x${value.toLowerCase()}`;
  } catch {
    return null;
  }
}

/**
 * Read the current holder of a reference-NFT token.
 * Prefers direct SLOAD (owner storage XOR); falls back to simulate `owner_of`.
 */
export async function getBoingNftOwner(input: {
  collection: string;
  tokenId: string;
}): Promise<{ owner: string | null; ok: true } | { owner: null; ok: false; error: string }> {
  const collection = normalizeBoingAccountId(input.collection);
  const tokenId = normalizeBoingTokenIdWord(input.tokenId);
  if (!isBoingNativeAccountIdHex(collection) || !tokenId) {
    return { owner: null, ok: false, error: "invalid_boing_nft_ref" };
  }

  try {
    const storageKey = referenceNftOwnerStorageKey(tokenId);
    const fromStorage = await getBoingContractStorage(collection, storageKey);
    if (fromStorage) {
      if (/^0x0{64}$/.test(fromStorage)) {
        return { owner: null, ok: true };
      }
      if (isBoingNativeAccountIdHex(fromStorage)) {
        return { owner: normalizeBoingAccountId(fromStorage), ok: true };
      }
    }

    const calldata = encodeBoingOwnerOf(tokenId);
    const sim = await boingRpc<{
      success?: boolean;
      return_data?: string;
      error?: string;
    }>("boing_simulateContractCall", [collection, calldata, null, "latest"]);
    if (!sim.success) {
      return {
        owner: null,
        ok: false,
        error: sim.error ?? "owner_of_simulate_failed",
      };
    }
    const raw = (sim.return_data ?? "0x").trim().toLowerCase();
    const word =
      raw === "0x" || raw === ""
        ? null
        : raw.startsWith("0x")
          ? raw.length >= 66
            ? `0x${raw.slice(2).padStart(64, "0").slice(-64)}`
            : raw.padEnd(66, "0").slice(0, 66)
          : `0x${raw.padStart(64, "0").slice(-64)}`;
    if (!word || /^0x0{64}$/.test(word)) return { owner: null, ok: true };
    if (!isBoingNativeAccountIdHex(word)) {
      return { owner: null, ok: false, error: "owner_of_bad_return" };
    }
    return { owner: normalizeBoingAccountId(word), ok: true };
  } catch (e) {
    return {
      owner: null,
      ok: false,
      error: e instanceof Error ? e.message : "boing_owner_unavailable",
    };
  }
}

export async function probeBoingNetwork(): Promise<{
  ok: boolean;
  chainId?: number;
  chainName?: string;
  height?: number;
}> {
  try {
    const info = await boingRpc<{
      chain_id?: number;
      chain_name?: string;
      head_height?: number;
      height?: number;
    }>("boing_getNetworkInfo");
    return {
      ok: true,
      chainId: info.chain_id,
      chainName: info.chain_name,
      height: info.head_height ?? info.height,
    };
  } catch {
    return { ok: false };
  }
}

export async function verifyBoingTx(txHash: string): Promise<boolean> {
  try {
    const receipt = await boingRpc<unknown>("boing_getTransactionReceipt", [
      txHash,
    ]);
    return receipt != null;
  } catch {
    return false;
  }
}

export type BoingQaResult = "allow" | "reject" | "unsure";

export async function preflightBoingNftDeployQa(input: {
  bytecode: string;
  assetName: string;
  assetSymbol: string;
  descriptionHash?: string;
}): Promise<{ result: BoingQaResult; ruleId?: string; message?: string }> {
  try {
    const qa = await boingRpc<{
      result?: BoingQaResult;
      rule_id?: string;
      message?: string;
    }>("boing_qaCheck", [
      input.bytecode,
      "nft",
      input.descriptionHash ?? QA_PLACEHOLDER_DESCRIPTION_HASH,
      input.assetName,
      input.assetSymbol,
    ]);
    return {
      result: qa.result ?? "unsure",
      ruleId: qa.rule_id,
      message: qa.message,
    };
  } catch (e) {
    return {
      result: "unsure",
      message: e instanceof Error ? e.message : "qa_unavailable",
    };
  }
}

function hexWord(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex").padStart(64, "0").slice(-64);
}

function selectorWord(selector: number): string {
  const w = new Uint8Array(32);
  w[31] = selector & 0xff;
  return hexWord(w);
}

function accountWord(address: string): string {
  const hex = address.replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error("boing_account_id_required");
  }
  return hex;
}

function tokenIdWordForListing(listingId: string): string {
  return createHash("sha256").update(`boing:token:${listingId}`).digest("hex");
}

function metadataHashWord(uri: string): string {
  return Buffer.from(blake3(new TextEncoder().encode(uri))).toString("hex");
}

/** 96-byte reference NFT `owner_of(token_id)` calldata. */
export function encodeBoingOwnerOf(tokenIdHex32: string): `0x${string}` {
  const tokenId = normalizeBoingTokenIdWord(tokenIdHex32);
  if (!tokenId) throw new Error("boing_token_id_invalid");
  return `0x${selectorWord(SELECTOR_OWNER_OF)}${tokenId.slice(2)}${"00".repeat(32)}`;
}

/** 96-byte reference NFT calldata (selector last byte + two argument words). */
export function encodeBoingTransferNft(
  toAccount: string,
  tokenIdHex32: string,
): `0x${string}` {
  return `0x${selectorWord(SELECTOR_TRANSFER_NFT)}${accountWord(toAccount)}${tokenIdHex32.replace(/^0x/, "")}`;
}

export function encodeBoingSetMetadataHash(
  tokenIdHex32: string,
  metadataHashHex32: string,
): `0x${string}` {
  return `0x${selectorWord(SELECTOR_SET_METADATA_HASH)}${tokenIdHex32.replace(/^0x/, "")}${metadataHashHex32.replace(/^0x/, "")}`;
}

function descriptionHashFromUri(uri: string): `0x${string}` {
  return `0x${metadataHashWord(uri)}`;
}

export function buildBoingMintIntent(input: {
  creatorAddress: string;
  metadataUri: string;
  listingId: string;
  title: string;
}): MintIntent & { walletTx: BoingWalletTx } {
  const tokenId = tokenIdWordForListing(input.listingId);
  const collection = marketAddressFor("boing");
  const creatorIsBoing = isBoingNativeAccountIdHex(input.creatorAddress);
  const creator = creatorIsBoing
    ? normalizeBoingAccountId(input.creatorAddress)
    : input.creatorAddress;
  const assetName = input.title.trim().slice(0, 32) || "FreshMint";
  const assetSymbol = "FMINT";
  const bytecode = resolveBoingNftCollectionBytecode();
  if (bytecode.length < 10) {
    throw new Error("boing_nft_bytecode_empty");
  }

  const tx = collection
    ? {
        type: "contract_call",
        to: collection,
        from: creator,
        calldata: creatorIsBoing
          ? encodeBoingTransferNft(creator, tokenId)
          : encodeBoingSetMetadataHash(tokenId, metadataHashWord(input.metadataUri)),
        purpose_category: "nft",
        asset_name: assetName,
        asset_symbol: assetSymbol,
      }
    : {
        type: "contract_deploy_meta",
        bytecode,
        purpose_category: "nft",
        asset_name: assetName,
        asset_symbol: assetSymbol,
        description_hash: descriptionHashFromUri(input.metadataUri),
        ...(creatorIsBoing ? { from: creator } : {}),
      };

  return {
    chain: "boing",
    network: "boing",
    contractAddress: collection ?? "pending-deploy",
    tokenId,
    txHash: "",
    calldata: "0x",
    status: "pending_wallet",
    walletTx: {
      chain: "boing",
      network: "boing",
      chainId: BOING_TESTNET_CHAIN_ID,
      method: "boing_sendTransaction",
      tx,
    },
  };
}

export function buildBoingPurchaseIntent(input: {
  buyerAddress: string;
  listingId: string;
  collection?: string | null;
  tokenId?: string | null;
  amountUsd: number;
  metadataUri?: string;
  title?: string;
}): {
  txHash: string;
  status: "simulated" | "pending_wallet";
  walletTx?: BoingWalletTx;
} {
  const buyerIsBoing = isBoingNativeAccountIdHex(input.buyerAddress);
  const buyer = buyerIsBoing
    ? normalizeBoingAccountId(input.buyerAddress)
    : input.buyerAddress;
  const configured =
    input.collection && isBoingNativeAccountIdHex(input.collection)
      ? normalizeBoingAccountId(input.collection)
      : marketAddressFor("boing");
  const tokenId = (input.tokenId ?? tokenIdWordForListing(input.listingId)).replace(
    /^0x/,
    "",
  );

  if (!buyerIsBoing) {
    return {
      txHash: simulatedBoingHash(),
      status: "simulated",
    };
  }

  if (!configured) {
    const mint = buildBoingMintIntent({
      creatorAddress: buyer,
      metadataUri:
        input.metadataUri ?? `https://freshmint.local/metadata/${input.listingId}`,
      listingId: input.listingId,
      title: input.title ?? input.listingId,
    });
    return {
      txHash: "",
      status: "pending_wallet",
      walletTx: mint.walletTx,
    };
  }

  return {
    txHash: "",
    status: "pending_wallet",
    walletTx: {
      chain: "boing",
      network: "boing",
      chainId: BOING_TESTNET_CHAIN_ID,
      method: "boing_sendTransaction",
      tx: {
        type: "contract_call",
        to: configured,
        from: buyer,
        calldata: encodeBoingTransferNft(buyer, tokenId),
        purpose_category: "nft",
        asset_name: `buy:${input.listingId}`.slice(0, 32),
        asset_symbol: "FMINT",
        metadata: {
          listingId: input.listingId,
          tokenId: input.tokenId,
          amountUsd: input.amountUsd,
        },
      },
    },
  };
}

export function simulatedBoingHash(): string {
  return `0x${randomBytes(32).toString("hex")}`;
}
