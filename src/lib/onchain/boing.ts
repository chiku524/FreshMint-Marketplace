import { createHash, randomBytes } from "node:crypto";
import { marketAddressFor, rpcUrlFor } from "@/lib/chains/registry";
import type { MintIntent } from "./evm";

export const BOING_TESTNET_CHAIN_ID = 6913;
export const BOING_TESTNET_CHAIN_ID_HEX = "0x1b01";

export function isBoingNativeAccountIdHex(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value.trim());
}

export function normalizeBoingAccountId(address: string): string {
  const raw = address.trim();
  const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return raw.toLowerCase();
  return `0x${hex.toLowerCase()}`;
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
    signal: AbortSignal.timeout(4000),
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

export function buildBoingMintIntent(input: {
  creatorAddress: string;
  metadataUri: string;
  listingId: string;
  title: string;
}): MintIntent & { walletTx: BoingWalletTx } {
  const tokenId = createHash("sha256")
    .update(`boing:${input.listingId}`)
    .digest("hex")
    .slice(0, 16);
  const collection = marketAddressFor("boing");
  const creator = isBoingNativeAccountIdHex(input.creatorAddress)
    ? normalizeBoingAccountId(input.creatorAddress)
    : input.creatorAddress;

  const tx = collection
    ? {
        type: "contract_call",
        to: collection,
        from: creator,
        calldata: encodeBoingMintCalldata(input.metadataUri, creator),
        purpose_category: "nft",
        asset_name: input.title.slice(0, 32),
        asset_symbol: "FMINT",
      }
    : {
        type: "contract_deploy_meta",
        purpose_category: "nft",
        asset_name: input.title.slice(0, 32),
        asset_symbol: "FMINT",
        metadata_uri: input.metadataUri,
        description: `FreshMint listing ${input.listingId}`,
        from: creator,
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
  status: "pending_wallet";
  walletTx: BoingWalletTx;
} {
  const buyer = isBoingNativeAccountIdHex(input.buyerAddress)
    ? normalizeBoingAccountId(input.buyerAddress)
    : input.buyerAddress;
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
        to: input.collection ?? "pending-deploy",
        from: buyer,
        purpose_category: "nft",
        asset_name: `buy:${input.listingId}`,
        metadata: {
          listingId: input.listingId,
          tokenId: input.tokenId,
          amountUsd: input.amountUsd,
        },
      },
    },
  };
}

/** Boing-native call encoding: selector low byte + 32-byte words (not Solidity ABI). */
function encodeBoingMintCalldata(uri: string, owner: string): string {
  const selector = "01";
  const ownerWord = owner.replace(/^0x/, "").padStart(64, "0").slice(0, 64);
  const uriHash = createHash("sha256").update(uri).digest("hex");
  return `0x${selector.padStart(64, "0")}${ownerWord}${uriHash}`;
}

export function simulatedBoingHash(): string {
  return `0x${randomBytes(32).toString("hex")}`;
}
