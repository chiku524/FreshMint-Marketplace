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
  REFERENCE_NFT_COLLECTION_TEMPLATE_V1,
  REFERENCE_NFT_COLLECTION_TEMPLATE_V3,
  isBoingNftTemplateV2DeployAvailable,
  isBoingNftTemplateV3DeployAvailable,
  resolveBoingNftCollectionBytecode,
  resolveBoingNftDeployTemplateVersion,
} from "@/lib/onchain/boing";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

async function probeDatabase(): Promise<"ok" | "unreachable" | "not_configured"> {
  if (!isPostgresConfigured()) return "not_configured";
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
    ]);
    return "ok";
  } catch {
    return "unreachable";
  }
}

export async function GET() {
  const mode = await ensureDatabaseReady();
  const url = getDatabaseUrl();
  const markets: Record<string, string | null> = {};
  for (const id of EVM_NETWORK_IDS) {
    markets[id] = marketAddressFor(id as NetworkId);
  }
  const [boing, database] = await Promise.all([
    probeBoingNetwork(),
    probeDatabase(),
  ]);
  const degraded = database === "unreachable";
  return NextResponse.json({
    ok: !degraded,
    database,
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
        version: resolveBoingNftDeployTemplateVersion(),
        preferred: REFERENCE_NFT_COLLECTION_TEMPLATE_V3,
        v1: REFERENCE_NFT_COLLECTION_TEMPLATE_V1,
        v2Available: isBoingNftTemplateV2DeployAvailable(),
        v3Available: isBoingNftTemplateV3DeployAvailable(),
        bytecodeBytes: (resolveBoingNftCollectionBytecode().length - 2) / 2,
      },
    },
    timestamp: new Date().toISOString(),
  }, { status: degraded ? 503 : 200 });
}
