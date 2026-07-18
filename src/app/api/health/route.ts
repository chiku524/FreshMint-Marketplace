import { ensureDatabaseReady } from "@/lib/db-ready";
import { isMemoryMode } from "@/lib/data/memory-store";
import { getDatabaseUrl, isPostgresConfigured } from "@/lib/env";
import { NextResponse } from "next/server";

export async function GET() {
  const mode = await ensureDatabaseReady();
  const url = getDatabaseUrl();
  return NextResponse.json({
    ok: true,
    mode: isMemoryMode() ? "memory" : mode,
    postgresConfigured: isPostgresConfigured(),
    databaseHost: url
      ? url.replace(/:[^:@/]+@/, ":****@").replace(/\/\/.*@/, "//***@")
      : null,
    vercel: Boolean(process.env.VERCEL),
    blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    evmMarket: process.env.NEXT_PUBLIC_EVM_MARKET_ADDRESS ?? null,
    timestamp: new Date().toISOString(),
  });
}
