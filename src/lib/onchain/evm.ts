import { createHash, randomBytes } from "node:crypto";
import type { Chain } from "@/lib/discovery/types";

export interface MintIntent {
  chain: Chain;
  network: string;
  contractAddress: string;
  tokenId: string;
  txHash: string;
  /** ABI-encoded mint calldata (demo / for wallet sendTransaction). */
  calldata: string;
  status: "simulated" | "submitted" | "confirmed";
}

const SEPOLIA_MARKET =
  process.env.NEXT_PUBLIC_EVM_MARKET_ADDRESS ??
  "0xFreshMint0000000000000000000000000001";

/**
 * Build a Sepolia mint intent. Without a deployer key we simulate settlement
 * while returning wallet-ready calldata shape for later wiring.
 */
export function buildEvmMintIntent(input: {
  creatorAddress: string;
  tokenUri: string;
  listingId: string;
}): MintIntent {
  const tokenId = String(
    BigInt("0x" + createHash("sha256").update(input.listingId).digest("hex").slice(0, 12)),
  );
  const txHash = `0x${randomBytes(32).toString("hex")}`;
  // Function selector for mint(address,string) — placeholder encoding
  const selector = "40c10f19";
  const calldata = `0x${selector}${Buffer.from(input.tokenUri).toString("hex").slice(0, 120)}`;

  return {
    chain: "evm",
    network: process.env.NEXT_PUBLIC_EVM_CHAIN ?? "sepolia",
    contractAddress: SEPOLIA_MARKET,
    tokenId,
    txHash,
    calldata,
    status: "simulated",
  };
}

export function buildEvmPurchaseIntent(input: {
  buyerAddress: string;
  contractAddress: string;
  tokenId: string;
  priceWei: string;
}): { txHash: string; to: string; value: string; data: string; status: "simulated" } {
  return {
    txHash: `0x${randomBytes(32).toString("hex")}`,
    to: input.contractAddress,
    value: input.priceWei,
    data: `0x${createHash("sha256").update(input.buyerAddress + input.tokenId).digest("hex").slice(0, 8)}`,
    status: "simulated",
  };
}
