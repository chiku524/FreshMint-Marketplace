import { createHash, randomBytes } from "node:crypto";
import type { Chain } from "@/lib/discovery/types";
import type { MintIntent } from "./evm";

const DEVNET_PROGRAM =
  process.env.NEXT_PUBLIC_SOLANA_PROGRAM_ID ??
  "FreshMint1111111111111111111111111111111";

export function buildSolanaMintIntent(input: {
  creatorAddress: string;
  metadataUri: string;
  listingId: string;
}): MintIntent {
  const mint = randomBytes(32).toString("base64url").slice(0, 32);
  const txHash = randomBytes(32).toString("base64url");
  const tokenId = createHash("sha256")
    .update(input.listingId + mint)
    .digest("hex")
    .slice(0, 16);

  return {
    chain: "solana" as Chain,
    network: process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet",
    contractAddress: DEVNET_PROGRAM,
    tokenId,
    txHash,
    calldata: JSON.stringify({
      programId: DEVNET_PROGRAM,
      instruction: "mint_edition",
      creator: input.creatorAddress,
      uri: input.metadataUri,
      mint,
    }),
    status: "simulated",
  };
}

export function buildSolanaPurchaseIntent(input: {
  buyerAddress: string;
  mintAddress: string;
  priceLamports: number;
}): { txHash: string; status: "simulated"; message: string } {
  return {
    txHash: randomBytes(32).toString("base64url"),
    status: "simulated",
    message: JSON.stringify({
      instruction: "buy",
      buyer: input.buyerAddress,
      mint: input.mintAddress,
      lamports: input.priceLamports,
    }),
  };
}
