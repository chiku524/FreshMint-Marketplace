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

  if (!configured || !buyerIsBoing) {
    return {
      txHash: simulatedBoingHash(),
      status: "simulated",
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
