import { getEngine } from "@/lib/data/store";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const viewerId = req.nextUrl.searchParams.get("viewerId");
  const pageSize = Number(req.nextUrl.searchParams.get("pageSize") ?? "20");
  const engine = getEngine();
  const result = engine.buildHomepage(viewerId, pageSize);
  return NextResponse.json({
    feed: result.feed,
    liveAuctions: result.liveAuctions,
    budgets: result.budgets,
    mix: result.mix,
  });
}
