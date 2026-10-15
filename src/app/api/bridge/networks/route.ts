import { bridgeableNetworks, relayApiBase } from "@/lib/bridge/relay";
import { chainMode } from "@/lib/chains/registry";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    mode: chainMode(),
    relayApi: relayApiBase(),
    networks: bridgeableNetworks(),
  }, {
    // Static config per deployment; let the CDN serve it.
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
