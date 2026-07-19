"use client";

import type { NetworkId } from "@/lib/discovery/types";

/** Browser helpers for sending prepared FreshMint txs. */

export type EvmWalletTx = {
  chain: "evm";
  network?: NetworkId;
  chainId?: number;
  to: string;
  data: string;
  value?: string;
  from?: string;
};

export type SolanaWalletTx = {
  chain: "solana";
  memo?: string;
  network?: string;
  serialized?: string;
};

const CHAIN_PARAMS: Record<
  number,
  { chainId: string; chainName: string; rpcUrls: string[]; nativeCurrency: { name: string; symbol: string; decimals: number }; blockExplorerUrls: string[] }
> = {
  11155111: {
    chainId: "0xaa36a7",
    chainName: "Sepolia",
    rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrls: ["https://sepolia.etherscan.io"],
  },
  84532: {
    chainId: "0x14a34",
    chainName: "Base Sepolia",
    rpcUrls: ["https://sepolia.base.org"],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrls: ["https://sepolia.basescan.org"],
  },
  421614: {
    chainId: "0x66eee",
    chainName: "Arbitrum Sepolia",
    rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrls: ["https://sepolia.arbiscan.io"],
  },
  11155420: {
    chainId: "0xaa37dc",
    chainName: "Optimism Sepolia",
    rpcUrls: ["https://sepolia.optimism.io"],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrls: ["https://sepolia-optimism.etherscan.io"],
  },
  1: {
    chainId: "0x1",
    chainName: "Ethereum",
    rpcUrls: ["https://ethereum-rpc.publicnode.com"],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrls: ["https://etherscan.io"],
  },
  8453: {
    chainId: "0x2105",
    chainName: "Base",
    rpcUrls: ["https://mainnet.base.org"],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrls: ["https://basescan.org"],
  },
  42161: {
    chainId: "0xa4b1",
    chainName: "Arbitrum One",
    rpcUrls: ["https://arb1.arbitrum.io/rpc"],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrls: ["https://arbiscan.io"],
  },
  10: {
    chainId: "0xa",
    chainName: "Optimism",
    rpcUrls: ["https://mainnet.optimism.io"],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrls: ["https://optimistic.etherscan.io"],
  },
};

async function ensureEvmChain(
  eth: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> },
  chainId: number,
) {
  const hex = `0x${chainId.toString(16)}`;
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hex }],
    });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 4902 && CHAIN_PARAMS[chainId]) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [CHAIN_PARAMS[chainId]],
      });
    }
  }
}

export async function sendEvmWalletTx(tx: EvmWalletTx): Promise<string> {
  const eth = (
    window as unknown as {
      ethereum?: {
        request: (args: {
          method: string;
          params?: unknown[];
        }) => Promise<unknown>;
      };
    }
  ).ethereum;
  if (!eth) throw new Error("No EVM wallet found (MetaMask / Rabby)");

  const accounts = (await eth.request({
    method: "eth_requestAccounts",
  })) as string[];
  const from = tx.from ?? accounts[0];
  if (!from) throw new Error("no_account");

  const chainId = tx.chainId ?? 11155111;
  await ensureEvmChain(eth, chainId);

  const hash = (await eth.request({
    method: "eth_sendTransaction",
    params: [
      {
        from,
        to: tx.to,
        data: tx.data,
        value: tx.value ?? "0x0",
      },
    ],
  })) as string;
  return hash;
}

export async function sendSolanaWalletTx(
  serializedBase64: string,
): Promise<string> {
  const provider = (
    window as unknown as {
      solana?: {
        connect: () => Promise<{ publicKey: { toString: () => string } }>;
        signAndSendTransaction: (tx: unknown) => Promise<{ signature: string }>;
      };
    }
  ).solana;
  if (!provider) throw new Error("No Solana wallet found (Phantom)");

  await provider.connect();
  const { Transaction } = await import("@solana/web3.js");
  const raw = atob(serializedBase64);
  const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  const tx = Transaction.from(bytes);
  const result = await provider.signAndSendTransaction(tx);
  return result.signature;
}

/** Prepare + send Solana mint/buy via wallet. */
export async function sendSolanaMintFromWallet(
  listingId: string,
  action: "mint" | "buy",
  amountUsd?: number,
): Promise<{ signature: string; assetAddress?: string }> {
  const res = await fetch("/api/onchain/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId, action, amountUsd }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "prepare_failed");
  if (!data.serialized) {
    throw new Error("solana_tx_unavailable");
  }
  const signature = await sendSolanaWalletTx(data.serialized as string);
  return {
    signature,
    assetAddress: data.assetAddress as string | undefined,
  };
}

export async function maybeSendWalletTx(input: {
  walletTx: unknown;
  listingId: string;
  action: "mint" | "buy";
  amountUsd?: number;
}): Promise<string | null> {
  const wt = input.walletTx as
    | (EvmWalletTx & { chain: string })
    | (SolanaWalletTx & { chain: string })
    | null
    | undefined;
  if (!wt || typeof wt !== "object") return null;

  if (wt.chain === "evm" && "to" in wt && "data" in wt) {
    return sendEvmWalletTx(wt as EvmWalletTx);
  }
  if (wt.chain === "solana") {
    if ("serialized" in wt && typeof wt.serialized === "string") {
      return sendSolanaWalletTx(wt.serialized);
    }
    const result = await sendSolanaMintFromWallet(
      input.listingId,
      input.action,
      input.amountUsd,
    );
    return result.signature;
  }
  return null;
}
