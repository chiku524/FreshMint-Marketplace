import { createHash, randomBytes } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  isAddress,
  parseEther,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import type { Chain } from "@/lib/discovery/types";
import { freshMintMarketAbi } from "./abi";

export interface MintIntent {
  chain: Chain;
  network: string;
  contractAddress: string;
  tokenId: string;
  txHash: string;
  calldata: Hex;
  value?: string;
  status: "simulated" | "pending_wallet" | "submitted" | "confirmed";
  to?: string;
}

export interface WalletTxRequest {
  chain: "evm";
  network: string;
  to: string;
  data: Hex;
  value: string;
  from?: string;
}

function marketAddress(): string {
  return (
    process.env.NEXT_PUBLIC_EVM_MARKET_ADDRESS ??
    "0x0000000000000000000000000000000000000000"
  );
}

function rpcUrl() {
  return (
    process.env.EVM_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com"
  );
}

function hasLiveMarket(): boolean {
  const addr = marketAddress();
  return isAddress(addr) && addr !== "0x0000000000000000000000000000000000000000";
}

export function buildEvmMintIntent(input: {
  creatorAddress: string;
  tokenUri: string;
  listingId: string;
  priceUsd?: number | null;
}): MintIntent & { walletTx?: WalletTxRequest } {
  const priceWei = parseEther(
    String(Math.max(input.priceUsd ?? 0, 0) > 0 ? (input.priceUsd! / 3000).toFixed(6) : "0"),
  );
  // Rough ETH estimate from USD for demo; override with explicit wei later if needed.

  const tokenId = String(
    BigInt(
      "0x" + createHash("sha256").update(input.listingId).digest("hex").slice(0, 12),
    ),
  );

  const to = marketAddress() as Hex;
  const calldata = hasLiveMarket()
    ? encodeFunctionData({
        abi: freshMintMarketAbi,
        functionName: "mint",
        args: [
          (isAddress(input.creatorAddress)
            ? input.creatorAddress
            : "0x0000000000000000000000000000000000000001") as Hex,
          input.tokenUri,
          priceWei,
        ],
      })
    : (`0x${createHash("sha256").update(input.listingId).digest("hex")}` as Hex);

  if (!hasLiveMarket()) {
    return {
      chain: "evm",
      network: process.env.NEXT_PUBLIC_EVM_CHAIN ?? "sepolia",
      contractAddress: to,
      tokenId,
      txHash: `0x${randomBytes(32).toString("hex")}`,
      calldata,
      status: "simulated",
    };
  }

  return {
    chain: "evm",
    network: "sepolia",
    contractAddress: to,
    tokenId,
    txHash: "",
    calldata,
    status: "pending_wallet",
    to,
    walletTx: {
      chain: "evm",
      network: "sepolia",
      to,
      data: calldata,
      value: "0x0",
      from: isAddress(input.creatorAddress) ? input.creatorAddress : undefined,
    },
  };
}

export function buildEvmPurchaseIntent(input: {
  buyerAddress: string;
  contractAddress: string;
  tokenId: string;
  priceWei: string;
}): {
  txHash: string;
  to: string;
  value: string;
  data: Hex;
  status: "simulated" | "pending_wallet";
  walletTx?: WalletTxRequest;
} {
  const to = (hasLiveMarket() ? marketAddress() : input.contractAddress) as Hex;
  const tokenId = BigInt(input.tokenId || "0");
  const data = hasLiveMarket()
    ? encodeFunctionData({
        abi: freshMintMarketAbi,
        functionName: "buy",
        args: [tokenId],
      })
    : (`0x${createHash("sha256").update(input.buyerAddress + input.tokenId).digest("hex").slice(0, 8).padEnd(8, "0")}` as Hex);

  const valueHex = `0x${BigInt(input.priceWei || "0").toString(16)}` as Hex;

  if (!hasLiveMarket()) {
    return {
      txHash: `0x${randomBytes(32).toString("hex")}`,
      to,
      value: valueHex,
      data,
      status: "simulated",
    };
  }

  return {
    txHash: "",
    to,
    value: valueHex,
    data,
    status: "pending_wallet",
    walletTx: {
      chain: "evm",
      network: "sepolia",
      to,
      data,
      value: valueHex,
      from: isAddress(input.buyerAddress) ? input.buyerAddress : undefined,
    },
  };
}

/** Optional server-side Sepolia mint when EVM_MINTER_PRIVATE_KEY is set. */
export async function sendEvmMintWithServerKey(input: {
  creatorAddress: string;
  tokenUri: string;
  priceWei: bigint;
}): Promise<{ txHash: Hex; tokenId?: string } | null> {
  const pk = process.env.EVM_MINTER_PRIVATE_KEY;
  if (!pk || !hasLiveMarket()) return null;
  if (!isAddress(input.creatorAddress)) return null;

  const account = privateKeyToAccount(pk as Hex);
  const wallet = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl()),
  });
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl()),
  });

  const hash = await wallet.writeContract({
    address: marketAddress() as Hex,
    abi: freshMintMarketAbi,
    functionName: "mint",
    args: [input.creatorAddress as Hex, input.tokenUri, input.priceWei],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { txHash: hash, tokenId: receipt.transactionIndex?.toString() };
}

export async function sendEvmBuyWithServerKey(input: {
  tokenId: string;
  valueWei: bigint;
}): Promise<{ txHash: Hex } | null> {
  const pk = process.env.EVM_MINTER_PRIVATE_KEY;
  if (!pk || !hasLiveMarket()) return null;

  const account = privateKeyToAccount(pk as Hex);
  const wallet = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl()),
  });

  const hash = await wallet.writeContract({
    address: marketAddress() as Hex,
    abi: freshMintMarketAbi,
    functionName: "buy",
    args: [BigInt(input.tokenId)],
    value: input.valueWei,
  });

  return { txHash: hash };
}
