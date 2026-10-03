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

export function isBoingNativeAccountIdHex(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value.trim());
}

export function normalizeBoingAccountId(address: string): string {
  const raw = address.trim();
  const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return raw.toLowerCase();
  return `0x${hex.toLowerCase()}`;
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
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error) {
    throw new Error(body.error.message ?? `boing_rpc_${method}`);
  }
  return body.result as T;
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

/** Matches `boing_primitives::nonce_derived_contract_address` / boing-sdk. */
export function predictNonceDerivedContractAddress(
  senderHex: string,
  deployTxNonce: bigint | number,
): string {
  const sender = normalizeBoingAccountId(senderHex);
  if (!isBoingNativeAccountIdHex(sender)) {
    throw new Error("boing_account_id_required");
  }
  const nonce =
    typeof deployTxNonce === "bigint" ? deployTxNonce : BigInt(deployTxNonce);
  if (nonce < BigInt(0) || nonce > BigInt("0xffffffffffffffff")) {
    throw new Error("deployTxNonce must fit u64");
  }
  const senderBytes = Buffer.from(sender.slice(2), "hex");
  const nonceLe = Buffer.alloc(8);
  let n = nonce;
  for (let i = 0; i < 8; i++) {
    nonceLe[i] = Number(n & BigInt(0xff));
    n >>= BigInt(8);
  }
  const preimage = Buffer.concat([senderBytes, nonceLe]);
  return `0x${Buffer.from(blake3(preimage)).toString("hex")}`;
}

/** Normalize wallet / RPC result shapes into a 32-byte tx id hex when possible. */
export function extractBoingTxHash(result: unknown): string | null {
  if (typeof result === "string") {
    const t = result.trim();
    if (/^0x[0-9a-fA-F]{64}$/.test(t)) return t.toLowerCase();
    // Node mempool acceptance is sometimes the literal "ok" — not a tx id.
    if (t === "ok" || t === "0xok") return null;
    if (t.length >= 8) return t;
    return null;
  }
  if (!result || typeof result !== "object") return null;
  const o = result as Record<string, unknown>;
  for (const key of ["tx_id", "txId", "hash", "tx_hash", "txHash", "transactionHash"]) {
    const v = o[key];
    if (typeof v === "string" && v !== "ok" && v.length >= 8) {
      return v.startsWith("0x") ? v : `0x${v}`;
    }
  }
  if (typeof o.contractAddress === "string" || typeof o.contract_address === "string") {
    // Some wallets return { contractAddress, tx_id } — hash extracted above when present.
  }
  return null;
}

export function extractBoingContractAddress(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const o = result as Record<string, unknown>;
  for (const key of [
    "contractAddress",
    "contract_address",
    "contract",
    "account_id",
    "accountId",
  ]) {
    const v = o[key];
    if (typeof v === "string" && isBoingNativeAccountIdHex(v)) {
      return normalizeBoingAccountId(v);
    }
  }
  return null;
}

export async function getBoingAccount(accountId: string): Promise<{
  balance: string;
  nonce: number;
  stake: string;
} | null> {
  try {
    const id = normalizeBoingAccountId(accountId);
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

type BoingBlockTx = {
  nonce?: number;
  sender?: string;
  payload?: Record<string, unknown>;
};

/**
 * Scan recent blocks for an NFT collection deploy by this sender (+ optional asset name).
 * Uses nonce-derived address prediction — no need for full tx-id bincode.
 */
export async function findBoingNftCollectionDeploy(input: {
  senderAddress: string;
  assetName?: string | null;
  lookbackBlocks?: number;
}): Promise<{
  contractAddress: string;
  txNonce: number;
  blockHeight: number;
  assetName?: string;
} | null> {
  if (!isBoingNativeAccountIdHex(input.senderAddress)) return null;
  const sender = normalizeBoingAccountId(input.senderAddress);
  const wantName = input.assetName?.trim().slice(0, 32) || null;
  const lookback = Math.min(Math.max(input.lookbackBlocks ?? 64, 8), 256);

  let tip = 0;
  try {
    const height = await boingRpc<number>("boing_chainHeight", []);
    tip = Number(height);
  } catch {
    return null;
  }
  if (!Number.isFinite(tip) || tip < 0) return null;

  const from = Math.max(0, tip - lookback + 1);
  for (let h = tip; h >= from; h--) {
    let block: { transactions?: BoingBlockTx[] } | null = null;
    try {
      block = await boingRpc<{ transactions?: BoingBlockTx[] }>(
        "boing_getBlockByHeight",
        [h, false],
      );
    } catch {
      continue;
    }
    const txs = block?.transactions ?? [];
    for (let i = txs.length - 1; i >= 0; i--) {
      const tx = txs[i]!;
      const txSender =
        typeof tx.sender === "string"
          ? normalizeBoingAccountId(tx.sender)
          : "";
      if (txSender !== sender) continue;
      const payload = tx.payload;
      if (!payload || typeof payload !== "object") continue;
      const meta =
        (payload.ContractDeployWithPurposeAndMetadata as
          | Record<string, unknown>
          | undefined) ??
        (payload.contract_deploy_meta as Record<string, unknown> | undefined);
      const purpose =
        (payload.ContractDeployWithPurpose as Record<string, unknown> | undefined) ??
        (payload.contract_deploy_purpose as Record<string, unknown> | undefined);
      const deploy = meta ?? purpose;
      if (!deploy) continue;
      const category = String(
        deploy.purpose_category ?? deploy.purposeCategory ?? "",
      ).toLowerCase();
      if (category && category !== "nft") continue;
      const assetName =
        typeof deploy.asset_name === "string"
          ? deploy.asset_name
          : typeof deploy.assetName === "string"
            ? deploy.assetName
            : undefined;
      if (wantName && assetName && assetName !== wantName) continue;
      if (wantName && !assetName) continue;
      const nonce = Number(tx.nonce);
      if (!Number.isFinite(nonce) || nonce < 0) continue;
      return {
        contractAddress: predictNonceDerivedContractAddress(sender, nonce),
        txNonce: nonce,
        blockHeight: h,
        assetName,
      };
    }
  }
  return null;
}

/**
 * After a successful wallet deploy, resolve the real contract AccountId.
 * Prefers an explicit address from the wallet, then receipt-adjacent nonce prediction.
 */
export async function resolveBoingDeployContractAddress(input: {
  creatorAddress: string;
  walletResult?: unknown;
  collectionId?: string;
  fallbackAddress?: string | null;
}): Promise<string | null> {
  const fromWallet = extractBoingContractAddress(input.walletResult);
  if (fromWallet) return fromWallet;

  const fallback = input.fallbackAddress?.trim();
  if (
    fallback &&
    isBoingNativeAccountIdHex(fallback) &&
    !(
      input.collectionId &&
      isProvisionalBoingCollectionAddress(input.collectionId, fallback)
    )
  ) {
    return normalizeBoingAccountId(fallback);
  }

  if (!isBoingNativeAccountIdHex(input.creatorAddress)) return null;
  const creator = normalizeBoingAccountId(input.creatorAddress);
  const acct = await getBoingAccount(creator);
  if (acct && acct.nonce > 0) {
    // Deploy consumed the prior nonce; current nonce is next unused.
    return predictNonceDerivedContractAddress(creator, acct.nonce - 1);
  }
  return null;
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
  /** Per-collection AccountId when already deployed; falls back to market env. */
  collectionAddress?: string | null;
}): MintIntent & { walletTx: BoingWalletTx } {
  const tokenId = tokenIdWordForListing(input.listingId);
  const fromInput =
    input.collectionAddress && isBoingNativeAccountIdHex(input.collectionAddress)
      ? normalizeBoingAccountId(input.collectionAddress)
      : null;
  const collection = fromInput || marketAddressFor("boing");
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
        // Boing Express expects `contract` (not EVM-style `to`).
        contract: collection,
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
        contract: configured,
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
