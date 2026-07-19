import { bridgeableNetworks, relayApiBase } from "@/lib/bridge/relay";
import { chainMode } from "@/lib/chains/registry";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    mode: chainMode(),
    relayApi: relayApiBase(),
    networks: bridgeableNetworks(),
  });
}
