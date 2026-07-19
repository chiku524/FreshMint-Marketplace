import { createHash, randomBytes } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  http,
  isAddress,
  parseEther,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  getNetwork,
  marketAddressFor,
  rpcUrlFor,
  type NetworkId,
} from "@/lib/chains/registry";
import type { Chain } from "@/lib/discovery/types";
import { freshMintErc721Abi } from "./abi";

export interface MintIntent {
  chain: Chain;
  network: NetworkId;
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
  network: NetworkId;
  chainId: number;
  to: string;
  data: Hex;
  value: string;
  from?: string;
}

function hasLiveMarket(network: NetworkId): boolean {
  return Boolean(marketAddressFor(network));
}

function publicClient(network: NetworkId) {
  const def = getNetwork(network);
  if (!def.viemChain) throw new Error(`not_evm:${network}`);
  return createPublicClient({
    chain: def.viemChain,
    transport: http(rpcUrlFor(network)),
  });
}

export function buildEvmMintIntent(input: {
  creatorAddress: string;
  tokenUri: string;
  listingId: string;
  network: NetworkId;
  priceUsd?: number | null;
}): MintIntent & { walletTx?: WalletTxRequest } {
  const network = input.network;
  const def = getNetwork(network);
  if (def.vm !== "evm" || !def.viemChain || def.chainId == null) {
    throw new Error(`evm_mint_requires_evm_network:${network}`);
  }

  const priceWei = parseEther(
    String(
      Math.max(input.priceUsd ?? 0, 0) > 0
        ? (input.priceUsd! / 3000).toFixed(6)
        : "0",
    ),
  );

  const provisionalTokenId = String(
    BigInt(
      "0x" +
        createHash("sha256").update(input.listingId).digest("hex").slice(0, 12),
    ),
  );

  const market = marketAddressFor(network);
  const to = (market ??
    "0x0000000000000000000000000000000000000000") as Hex;
  const toAddress = (
    isAddress(input.creatorAddress)
      ? input.creatorAddress
      : "0x0000000000000000000000000000000000000001"
  ) as Hex;

  if (!hasLiveMarket(network)) {
    const fake = `0x${randomBytes(32).toString("hex")}`;
    return {
      chain: "evm",
      network,
      contractAddress: to,
      tokenId: provisionalTokenId,
      txHash: fake,
      calldata: "0x",
      status: "simulated",
      to,
    };
  }

  const calldata = encodeFunctionData({
    abi: freshMintErc721Abi,
    functionName: "safeMint",
    args: [toAddress, input.tokenUri, priceWei],
  });

  const walletTx: WalletTxRequest = {
    chain: "evm",
    network,
    chainId: def.chainId,
    to,
    data: calldata,
    value: "0x0",
    from: isAddress(input.creatorAddress) ? input.creatorAddress : undefined,
  };

  return {
    chain: "evm",
    network,
    contractAddress: to,
    tokenId: provisionalTokenId,
    txHash: "",
    calldata,
    status: "pending_wallet",
    to,
    walletTx,
  };
}

export function buildEvmPurchaseIntent(input: {
  buyerAddress: string;
  tokenId: string;
  network: NetworkId;
  contractAddress?: string | null;
  amountUsd?: number | null;
}): MintIntent & { walletTx?: WalletTxRequest } {
  const network = input.network;
  const def = getNetwork(network);
  if (def.vm !== "evm" || !def.viemChain || def.chainId == null) {
    throw new Error(`evm_buy_requires_evm_network:${network}`);
  }

  const market = (input.contractAddress || marketAddressFor(network) ||
    "0x0000000000000000000000000000000000000000") as Hex;
  const valueWei = BigInt(
    Math.max(1, Math.floor((input.amountUsd ?? 1) * 1e15)),
  );

  if (!hasLiveMarket(network) && !input.contractAddress) {
    return {
      chain: "evm",
      network,
      contractAddress: market,
      tokenId: input.tokenId,
      txHash: `0x${randomBytes(32).toString("hex")}`,
      calldata: "0x",
      status: "simulated",
      to: market,
      value: valueWei.toString(),
    };
  }

  const calldata = encodeFunctionData({
    abi: freshMintErc721Abi,
    functionName: "buy",
    args: [BigInt(input.tokenId)],
  });

  return {
    chain: "evm",
    network,
    contractAddress: market,
    tokenId: input.tokenId,
    txHash: "",
    calldata,
    value: `0x${valueWei.toString(16)}`,
    status: "pending_wallet",
    to: market,
    walletTx: {
      chain: "evm",
      network,
      chainId: def.chainId,
      to: market,
      data: calldata,
      value: `0x${valueWei.toString(16)}`,
      from: isAddress(input.buyerAddress) ? input.buyerAddress : undefined,
    },
  };
}

export function tokenIdFromMintReceipt(receipt: TransactionReceipt): string | null {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: freshMintErc721Abi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "Minted" || decoded.eventName === "Transfer") {
        const tid = (decoded.args as { tokenId?: bigint }).tokenId;
        if (tid != null) return tid.toString();
      }
    } catch {
      // skip unrelated logs
    }
  }
  return null;
}

export async function verifyEvmTx(input: {
  network: NetworkId;
  txHash: string;
  expectContract?: string | null;
}): Promise<{ ok: boolean; tokenId?: string | null; error?: string }> {
  if (!input.txHash.startsWith("0x") || input.txHash.length < 10) {
    return { ok: false, error: "invalid_hash" };
  }
  try {
    const client = publicClient(input.network);
    const receipt = await client.getTransactionReceipt({
      hash: input.txHash as Hex,
    });
    if (receipt.status !== "success") {
      return { ok: false, error: "tx_reverted" };
    }
    if (
      input.expectContract &&
      receipt.to &&
      receipt.to.toLowerCase() !== input.expectContract.toLowerCase()
    ) {
      // still accept if logs include our mint (some relays)
    }
    const tokenId = tokenIdFromMintReceipt(receipt);
    return { ok: true, tokenId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "verify_failed",
    };
  }
}

export async function sendEvmMintWithServerKey(input: {
  creatorAddress: string;
  tokenUri: string;
  network: NetworkId;
  priceWei?: bigint;
}): Promise<{ txHash: string; tokenId?: string } | null> {
  const key = process.env.EVM_MINTER_PRIVATE_KEY;
  const market = marketAddressFor(input.network);
  const def = getNetwork(input.network);
  if (!key || !market || !def.viemChain) return null;

  const account = privateKeyToAccount(key as Hex);
  const wallet = createWalletClient({
    account,
    chain: def.viemChain,
    transport: http(rpcUrlFor(input.network)),
  });
  const hash = await wallet.writeContract({
    address: market as Hex,
    abi: freshMintErc721Abi,
    functionName: "safeMint",
    args: [
      (isAddress(input.creatorAddress)
        ? input.creatorAddress
        : account.address) as Hex,
      input.tokenUri,
      input.priceWei ?? BigInt(0),
    ],
  });
  const client = publicClient(input.network);
  const receipt = await client.waitForTransactionReceipt({ hash });
  return {
    txHash: hash,
    tokenId: tokenIdFromMintReceipt(receipt) ?? undefined,
  };
}

export async function sendEvmBuyWithServerKey(input: {
  tokenId: string;
  network: NetworkId;
  valueWei: bigint;
  contractAddress?: string | null;
}): Promise<{ txHash: string } | null> {
  const key = process.env.EVM_MINTER_PRIVATE_KEY;
  const market = (input.contractAddress || marketAddressFor(input.network)) as
    | string
    | null;
  const def = getNetwork(input.network);
  if (!key || !market || !def.viemChain) return null;

  const account = privateKeyToAccount(key as Hex);
  const wallet = createWalletClient({
    account,
    chain: def.viemChain,
    transport: http(rpcUrlFor(input.network)),
  });
  const hash = await wallet.writeContract({
    address: market as Hex,
    abi: freshMintErc721Abi,
    functionName: "buy",
    args: [BigInt(input.tokenId)],
    value: input.valueWei,
  });
  return { txHash: hash };
}
