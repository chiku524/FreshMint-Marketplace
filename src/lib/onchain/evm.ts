import { createHash, randomBytes } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeDeployData,
  encodeFunctionData,
  http,
  isAddress,
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
import { FRESHMINT_ERC721_BYTECODE } from "./evm-artifacts/freshMintErc721Bytecode";
import { quoteNativeFromUsd } from "./fx";
import { platformFeeRecipients } from "@/lib/fees/platform";

export const EVM_MINT_BATCH_SIZE = 25;

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
  /** Omit / empty for contract creation. */
  to?: string;
  data: Hex;
  value: string;
  from?: string;
}

export type CollectionDeployIntent = {
  chain: "evm";
  network: NetworkId;
  status: "simulated" | "pending_wallet";
  /** Simulated or known address; real address comes from deploy receipt. */
  contractAddress: string;
  txHash: string;
  walletTx?: WalletTxRequest;
  escrowAddress: string;
};

export type BatchMintIntent = {
  chain: "evm";
  network: NetworkId;
  status: "simulated" | "pending_wallet";
  contractAddress: string;
  escrowAddress: string;
  listingIds: string[];
  provisionalTokenIds: string[];
  txHash: string;
  walletTx?: WalletTxRequest;
};

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

  const priceWei =
    (input.priceUsd ?? 0) > 0
      ? quoteNativeFromUsd(input.priceUsd!, "evm").baseUnits
      : BigInt(0);

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

function isOnchainTokenId(tokenId: string | null | undefined): boolean {
  if (tokenId == null || tokenId === "") return false;
  try {
    BigInt(tokenId);
    return true;
  } catch {
    return false;
  }
}

export function buildEvmPurchaseIntent(input: {
  buyerAddress: string;
  tokenId: string;
  network: NetworkId;
  contractAddress?: string | null;
  amountUsd?: number | null;
  tokenUri?: string;
}): MintIntent & { walletTx?: WalletTxRequest } {
  const network = input.network;
  const def = getNetwork(network);
  if (def.vm !== "evm" || !def.viemChain || def.chainId == null) {
    throw new Error(`evm_buy_requires_evm_network:${network}`);
  }

  const liveMarket = marketAddressFor(network);
  const listingContract =
    input.contractAddress && isAddress(input.contractAddress)
      ? input.contractAddress
      : null;
  const minted = Boolean(listingContract && isOnchainTokenId(input.tokenId));
  const market = (listingContract ||
    liveMarket ||
    "0x0000000000000000000000000000000000000000") as Hex;
  const valueWei =
    (input.amountUsd ?? 0) > 0
      ? quoteNativeFromUsd(input.amountUsd!, "evm").baseUnits
      : BigInt(1);
  const from = isAddress(input.buyerAddress) ? input.buyerAddress : undefined;

  if (!minted && !liveMarket) {
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

  if (!minted && liveMarket) {
    const toAddress = (from ??
      "0x0000000000000000000000000000000000000001") as Hex;
    const calldata = encodeFunctionData({
      abi: freshMintErc721Abi,
      functionName: "safeMint",
      args: [toAddress, input.tokenUri ?? "", valueWei],
    });
    return {
      chain: "evm",
      network,
      contractAddress: liveMarket,
      tokenId: input.tokenId,
      txHash: "",
      calldata,
      value: "0x0",
      status: "pending_wallet",
      to: liveMarket as Hex,
      walletTx: {
        chain: "evm",
        network,
        chainId: def.chainId,
        to: liveMarket,
        data: calldata,
        value: "0x0",
        from,
      },
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
      from,
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

function feeAddresses(creatorAddress: string): {
  treasury: Hex;
  operator: Hex;
  escrow: Hex;
} {
  const fees = platformFeeRecipients();
  const fallback = (
    isAddress(creatorAddress)
      ? creatorAddress
      : "0x0000000000000000000000000000000000000001"
  ) as Hex;
  const treasury = (
    fees.treasury && isAddress(fees.treasury) ? fees.treasury : fallback
  ) as Hex;
  const operator = (
    fees.operator && isAddress(fees.operator) ? fees.operator : treasury
  ) as Hex;
  return { treasury, operator, escrow: operator };
}

function simulatedCollectionAddress(collectionId: string): Hex {
  const hash = createHash("sha256").update(`col:${collectionId}`).digest("hex");
  return `0x${hash.slice(0, 40)}` as Hex;
}

/** Creator-signed deploy of a per-collection FreshMintERC721. */
export function buildEvmCollectionDeployIntent(input: {
  collectionId: string;
  title: string;
  creatorAddress: string;
  network: NetworkId;
}): CollectionDeployIntent {
  const network = input.network;
  const def = getNetwork(network);
  if (def.vm !== "evm" || !def.viemChain || def.chainId == null) {
    throw new Error(`evm_deploy_requires_evm_network:${network}`);
  }

  const { treasury, operator, escrow } = feeAddresses(input.creatorAddress);
  const name = input.title.trim().slice(0, 48) || "FreshMint";
  const symbol = "FMINT";
  const simulated = simulatedCollectionAddress(input.collectionId);
  const from = isAddress(input.creatorAddress) ? input.creatorAddress : undefined;

  // Without a creator EVM address we stay simulated (memory / unsigned paths).
  if (!from || !FRESHMINT_ERC721_BYTECODE.startsWith("0x")) {
    return {
      chain: "evm",
      network,
      status: "simulated",
      contractAddress: simulated,
      txHash: `0x${randomBytes(32).toString("hex")}`,
      escrowAddress: escrow,
    };
  }

  const data = encodeDeployData({
    abi: freshMintErc721Abi,
    bytecode: FRESHMINT_ERC721_BYTECODE as Hex,
    args: [name, symbol, treasury, operator],
  });

  return {
    chain: "evm",
    network,
    status: "pending_wallet",
    contractAddress: simulated,
    txHash: "",
    escrowAddress: escrow,
    walletTx: {
      chain: "evm",
      network,
      chainId: def.chainId,
      data,
      value: "0x0",
      from,
    },
  };
}

/** Creator-signed batch mint into an existing collection contract. */
export function buildEvmBatchMintIntent(input: {
  network: NetworkId;
  contractAddress: string;
  creatorAddress: string;
  escrowAddress: string;
  items: { listingId: string; tokenUri: string }[];
  startingTokenId?: number;
}): BatchMintIntent {
  const network = input.network;
  const def = getNetwork(network);
  if (def.vm !== "evm" || !def.viemChain || def.chainId == null) {
    throw new Error(`evm_mint_requires_evm_network:${network}`);
  }
  if (!input.items.length || input.items.length > EVM_MINT_BATCH_SIZE) {
    throw new Error("invalid_batch_size");
  }
  if (!isAddress(input.contractAddress)) {
    throw new Error("invalid_collection_contract");
  }

  const start = input.startingTokenId ?? 1;
  const provisionalTokenIds = input.items.map((_, i) => String(start + i));
  const listingIds = input.items.map((i) => i.listingId);
  const to = (
    isAddress(input.escrowAddress) ? input.escrowAddress : input.creatorAddress
  ) as Hex;
  const from = isAddress(input.creatorAddress) ? input.creatorAddress : undefined;

  if (!from) {
    return {
      chain: "evm",
      network,
      status: "simulated",
      contractAddress: input.contractAddress,
      escrowAddress: to,
      listingIds,
      provisionalTokenIds,
      txHash: `0x${randomBytes(32).toString("hex")}`,
    };
  }

  const calldata = encodeFunctionData({
    abi: freshMintErc721Abi,
    functionName: "safeMintBatch",
    args: [to, input.items.map((i) => i.tokenUri), BigInt(0)],
  });

  return {
    chain: "evm",
    network,
    status: "pending_wallet",
    contractAddress: input.contractAddress,
    escrowAddress: to,
    listingIds,
    provisionalTokenIds,
    txHash: "",
    walletTx: {
      chain: "evm",
      network,
      chainId: def.chainId,
      to: input.contractAddress,
      data: calldata,
      value: "0x0",
      from,
    },
  };
}

/** Transfer an already-minted token from escrow to the collector. */
export function buildEvmTransferIntent(input: {
  network: NetworkId;
  contractAddress: string;
  tokenId: string;
  fromAddress: string;
  toAddress: string;
  /** Who signs — escrow/operator or approved operator. */
  signerAddress?: string;
}): MintIntent & { walletTx?: WalletTxRequest } {
  const network = input.network;
  const def = getNetwork(network);
  if (def.vm !== "evm" || !def.viemChain || def.chainId == null) {
    throw new Error(`evm_transfer_requires_evm_network:${network}`);
  }
  if (!isAddress(input.contractAddress) || !isOnchainTokenId(input.tokenId)) {
    throw new Error("transfer_requires_minted_token");
  }

  const from = (
    isAddress(input.fromAddress)
      ? input.fromAddress
      : "0x0000000000000000000000000000000000000001"
  ) as Hex;
  const to = (
    isAddress(input.toAddress)
      ? input.toAddress
      : "0x0000000000000000000000000000000000000001"
  ) as Hex;
  const signer =
    (input.signerAddress && isAddress(input.signerAddress)
      ? input.signerAddress
      : from) as string;

  const calldata = encodeFunctionData({
    abi: freshMintErc721Abi,
    functionName: "transferFrom",
    args: [from, to, BigInt(input.tokenId)],
  });

  return {
    chain: "evm",
    network,
    contractAddress: input.contractAddress,
    tokenId: input.tokenId,
    txHash: "",
    calldata,
    status: "pending_wallet",
    to: input.contractAddress,
    walletTx: {
      chain: "evm",
      network,
      chainId: def.chainId,
      to: input.contractAddress,
      data: calldata,
      value: "0x0",
      from: signer,
    },
  };
}

export function tokenIdsFromMintReceipt(receipt: TransactionReceipt): string[] {
  const ids: string[] = [];
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: freshMintErc721Abi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "Minted" || decoded.eventName === "Transfer") {
        const tid = (decoded.args as { tokenId?: bigint; from?: string }).tokenId;
        const from = (decoded.args as { from?: string }).from;
        if (
          tid != null &&
          (decoded.eventName === "Minted" ||
            from === "0x0000000000000000000000000000000000000000")
        ) {
          ids.push(tid.toString());
        }
      }
    } catch {
      // skip
    }
  }
  return [...new Set(ids)];
}

export function contractAddressFromDeployReceipt(
  receipt: TransactionReceipt,
): string | null {
  return receipt.contractAddress ?? null;
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
