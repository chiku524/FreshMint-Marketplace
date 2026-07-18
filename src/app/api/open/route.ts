import { getDiscoveryEngine } from "@/lib/marketplace/service";
import type { Chain, ListingType } from "@/lib/discovery/types";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const engine = await getDiscoveryEngine();
  const items = engine.buildOpenLane({
    chain: (sp.get("chain") as Chain | null) ?? undefined,
    medium: sp.get("medium") ?? undefined,
    style: sp.get("style") ?? undefined,
    type: (sp.get("type") as ListingType | null) ?? undefined,
    query: sp.get("q") ?? undefined,
    maxPriceUsd: sp.get("maxPrice") ? Number(sp.get("maxPrice")) : undefined,
    minPriceUsd: sp.get("minPrice") ? Number(sp.get("minPrice")) : undefined,
  });
  return NextResponse.json({ items, count: items.length });
}
