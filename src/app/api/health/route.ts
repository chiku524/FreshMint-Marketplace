import {
  chainMode,
  EVM_NETWORK_IDS,
  marketAddressFor,
  type NetworkId,
} from "@/lib/chains/registry";
import { relayApiBase } from "@/lib/bridge/relay";
import { ensureDatabaseReady } from "@/lib/db-ready";
import { isMemoryMode } from "@/lib/data/memory-store";
import { getDatabaseUrl, isPostgresConfigured } from "@/lib/env";
import {
  probeBoingNetwork,
  REFERENCE_NFT_COLLECTION_TEMPLATE_ARTIFACT_ID,
  REFERENCE_NFT_COLLECTION_TEMPLATE_VERSION,
  resolveBoingNftCollectionBytecode,
} from "@/lib/onchain/boing";
import { NextResponse } from "next/server";

export async function GET() {
  const mode = await ensureDatabaseReady();
  const url = getDatabaseUrl();
  const markets: Record<string, string | null> = {};
  for (const id of EVM_NETWORK_IDS) {
    markets[id] = marketAddressFor(id as NetworkId);
  }
  const boing = await probeBoingNetwork();
  return NextResponse.json({
    ok: true,
    mode: isMemoryMode() ? "memory" : mode,
    postgresConfigured: isPostgresConfigured(),
    databaseHost: url
      ? url.replace(/:[^:@/]+@/, ":****@").replace(/\/\/.*@/, "//***@")
      : null,
    vercel: Boolean(process.env.VERCEL),
    blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    chainMode: chainMode(),
    relayApi: relayApiBase(),
    evmMarkets: markets,
    /** @deprecated use evmMarkets.ethereum */
    evmMarket:
      markets.ethereum ?? process.env.NEXT_PUBLIC_EVM_MARKET_ADDRESS ?? null,
    solanaMintMode: process.env.SOLANA_MINT_MODE ?? "metaplex",
    boing: {
      collection: marketAddressFor("boing"),
      rpc: boing,
      nftTemplate: {
        artifactId: REFERENCE_NFT_COLLECTION_TEMPLATE_ARTIFACT_ID,
        version: REFERENCE_NFT_COLLECTION_TEMPLATE_VERSION,
        bytecodeBytes: (resolveBoingNftCollectionBytecode().length - 2) / 2,
      },
    },
    timestamp: new Date().toISOString(),
  });
}
