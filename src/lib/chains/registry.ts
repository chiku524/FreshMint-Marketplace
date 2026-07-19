import {
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia,
  mainnet,
  optimism,
  optimismSepolia,
  sepolia,
  type Chain as ViemChain,
} from "viem/chains";
import type { Chain } from "@/lib/discovery/types";

/** Settlement / bridge network ids (mint + native bridge). */
export type NetworkId =
  | "ethereum"
  | "base"
  | "arbitrum"
  | "optimism"
  | "solana";

export type ChainMode = "testnet" | "mainnet";

export interface NetworkDef {
  id: NetworkId;
  label: string;
  vm: Chain;
  nativeSymbol: "ETH" | "SOL";
  /** Relay / display decimals for native. */
  decimals: number;
  /** viem chain when vm === evm */
  viemChain?: ViemChain;
  chainId?: number;
  explorerTx: (hash: string) => string;
  explorerAddress: (address: string) => string;
  explorerToken?: (contract: string, tokenId: string) => string;
  rpcEnvKey: string;
  marketEnvKey?: string;
  defaultRpc: string;
}

const MODE: ChainMode =
  process.env.NEXT_PUBLIC_CHAIN_MODE === "mainnet" ? "mainnet" : "testnet";

export function chainMode(): ChainMode {
  return MODE;
}

function ethExplorer(
  testBase: string,
  mainBase: string,
): Pick<NetworkDef, "explorerTx" | "explorerAddress" | "explorerToken"> {
  const baseUrl = MODE === "mainnet" ? mainBase : testBase;
  return {
    explorerTx: (hash) => `${baseUrl}/tx/${hash}`,
    explorerAddress: (address) => `${baseUrl}/address/${address}`,
    explorerToken: (contract, tokenId) =>
      `${baseUrl}/token/${contract}?a=${tokenId}`,
  };
}

const NETWORKS_TESTNET: Record<NetworkId, NetworkDef> = {
  ethereum: {
    id: "ethereum",
    label: "Ethereum Sepolia",
    vm: "evm",
    nativeSymbol: "ETH",
    decimals: 18,
    viemChain: sepolia,
    chainId: sepolia.id,
    ...ethExplorer("https://sepolia.etherscan.io", "https://etherscan.io"),
    rpcEnvKey: "EVM_RPC_URL_ETHEREUM",
    marketEnvKey: "NEXT_PUBLIC_EVM_MARKET_ADDRESS_ETHEREUM",
    defaultRpc: "https://ethereum-sepolia-rpc.publicnode.com",
  },
  base: {
    id: "base",
    label: "Base Sepolia",
    vm: "evm",
    nativeSymbol: "ETH",
    decimals: 18,
    viemChain: baseSepolia,
    chainId: baseSepolia.id,
    ...ethExplorer("https://sepolia.basescan.org", "https://basescan.org"),
    rpcEnvKey: "EVM_RPC_URL_BASE",
    marketEnvKey: "NEXT_PUBLIC_EVM_MARKET_ADDRESS_BASE",
    defaultRpc: "https://sepolia.base.org",
  },
  arbitrum: {
    id: "arbitrum",
    label: "Arbitrum Sepolia",
    vm: "evm",
    nativeSymbol: "ETH",
    decimals: 18,
    viemChain: arbitrumSepolia,
    chainId: arbitrumSepolia.id,
    ...ethExplorer("https://sepolia.arbiscan.io", "https://arbiscan.io"),
    rpcEnvKey: "EVM_RPC_URL_ARBITRUM",
    marketEnvKey: "NEXT_PUBLIC_EVM_MARKET_ADDRESS_ARBITRUM",
    defaultRpc: "https://sepolia-rollup.arbitrum.io/rpc",
  },
  optimism: {
    id: "optimism",
    label: "Optimism Sepolia",
    vm: "evm",
    nativeSymbol: "ETH",
    decimals: 18,
    viemChain: optimismSepolia,
    chainId: optimismSepolia.id,
    ...ethExplorer(
      "https://sepolia-optimism.etherscan.io",
      "https://optimistic.etherscan.io",
    ),
    rpcEnvKey: "EVM_RPC_URL_OPTIMISM",
    marketEnvKey: "NEXT_PUBLIC_EVM_MARKET_ADDRESS_OPTIMISM",
    defaultRpc: "https://sepolia.optimism.io",
  },
  solana: {
    id: "solana",
    label: "Solana Devnet",
    vm: "solana",
    nativeSymbol: "SOL",
    decimals: 9,
    explorerTx: (hash) =>
      `https://explorer.solana.com/tx/${hash}?cluster=devnet`,
    explorerAddress: (address) =>
      `https://explorer.solana.com/address/${address}?cluster=devnet`,
    rpcEnvKey: "SOLANA_RPC_URL",
    defaultRpc: "https://api.devnet.solana.com",
  },
};

const NETWORKS_MAINNET: Record<NetworkId, NetworkDef> = {
  ethereum: {
    ...NETWORKS_TESTNET.ethereum,
    label: "Ethereum",
    viemChain: mainnet,
    chainId: mainnet.id,
    ...ethExplorer("https://sepolia.etherscan.io", "https://etherscan.io"),
    defaultRpc: "https://ethereum-rpc.publicnode.com",
  },
  base: {
    ...NETWORKS_TESTNET.base,
    label: "Base",
    viemChain: base,
    chainId: base.id,
    ...ethExplorer("https://sepolia.basescan.org", "https://basescan.org"),
    defaultRpc: "https://mainnet.base.org",
  },
  arbitrum: {
    ...NETWORKS_TESTNET.arbitrum,
    label: "Arbitrum One",
    viemChain: arbitrum,
    chainId: arbitrum.id,
    ...ethExplorer("https://sepolia.arbiscan.io", "https://arbiscan.io"),
    defaultRpc: "https://arb1.arbitrum.io/rpc",
  },
  optimism: {
    ...NETWORKS_TESTNET.optimism,
    label: "Optimism",
    viemChain: optimism,
    chainId: optimism.id,
    ...ethExplorer(
      "https://sepolia-optimism.etherscan.io",
      "https://optimistic.etherscan.io",
    ),
    defaultRpc: "https://mainnet.optimism.io",
  },
  solana: {
    ...NETWORKS_TESTNET.solana,
    label: "Solana",
    explorerTx: (hash) => `https://explorer.solana.com/tx/${hash}`,
    explorerAddress: (address) =>
      `https://explorer.solana.com/address/${address}`,
    defaultRpc: "https://api.mainnet-beta.solana.com",
  },
};

const TABLE = MODE === "mainnet" ? NETWORKS_MAINNET : NETWORKS_TESTNET;

export const NETWORK_IDS: NetworkId[] = [
  "ethereum",
  "base",
  "arbitrum",
  "optimism",
  "solana",
];

export const EVM_NETWORK_IDS: NetworkId[] = [
  "ethereum",
  "base",
  "arbitrum",
  "optimism",
];

export function getNetwork(id: NetworkId): NetworkDef {
  return TABLE[id];
}

export function listNetworks(): NetworkDef[] {
  return NETWORK_IDS.map((id) => TABLE[id]);
}

export function listBridgeNetworks(): NetworkDef[] {
  return listNetworks();
}

export function isNetworkId(value: string): value is NetworkId {
  return NETWORK_IDS.includes(value as NetworkId);
}

export function vmFromNetwork(id: NetworkId): Chain {
  return getNetwork(id).vm;
}

/** Map legacy chain + optional network; default ethereum for evm. */
export function resolveNetwork(
  network: string | null | undefined,
  chain?: Chain | string | null,
): NetworkId {
  if (network && isNetworkId(network)) return network;
  if (chain === "solana") return "solana";
  return "ethereum";
}

export function rpcUrlFor(network: NetworkId): string {
  const def = getNetwork(network);
  const fromEnv = process.env[def.rpcEnvKey];
  if (fromEnv) return fromEnv;
  // Legacy single EVM RPC fallback for ethereum
  if (network === "ethereum" && process.env.EVM_RPC_URL) {
    return process.env.EVM_RPC_URL;
  }
  return def.defaultRpc;
}

export function marketAddressFor(network: NetworkId): string | null {
  const def = getNetwork(network);
  if (!def.marketEnvKey) return null;
  const addr = process.env[def.marketEnvKey];
  if (addr && addr !== "0x0000000000000000000000000000000000000000") {
    return addr;
  }
  // Legacy single market address → ethereum
  if (network === "ethereum" && process.env.NEXT_PUBLIC_EVM_MARKET_ADDRESS) {
    const legacy = process.env.NEXT_PUBLIC_EVM_MARKET_ADDRESS;
    if (legacy !== "0x0000000000000000000000000000000000000000") return legacy;
  }
  return null;
}

export function chainIdHex(network: NetworkId): string | null {
  const id = getNetwork(network).chainId;
  if (id == null) return null;
  return `0x${id.toString(16)}`;
}
