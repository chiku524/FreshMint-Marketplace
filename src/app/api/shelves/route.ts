import { getDiscoveryEngine } from "@/lib/marketplace/service";
import { NextResponse } from "next/server";

export async function GET() {
  const engine = await getDiscoveryEngine();
  return NextResponse.json({
    shelves: [...engine.state.shelves.values()],
  });
}
