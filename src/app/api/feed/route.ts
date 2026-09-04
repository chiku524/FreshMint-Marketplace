import { getSessionUser } from "@/lib/auth/session";
import { readViewerSession, readViewerTaste } from "@/lib/discovery/cookies";
import { hasTaste, inferTasteFromCatalog } from "@/lib/discovery/taste";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  const viewerId =
    req.nextUrl.searchParams.get("viewerId") ?? user?.id ?? null;
  const pageSize = Number(req.nextUrl.searchParams.get("pageSize") ?? "20");
  const engine = await getDiscoveryEngine();
  const session = await readViewerSession(viewerId);
  const cookieTaste = await readViewerTaste();
  const follows = viewerId ? engine.state.follows.get(viewerId) ?? null : null;
  const taste = hasTaste(cookieTaste)
    ? cookieTaste
    : inferTasteFromCatalog(follows, engine.state.listings.values());

  const result = engine.buildHomepage(viewerId, pageSize, Date.now(), {
    session,
    taste,
    recordImpressions: false,
  });

  return NextResponse.json({
    feed: result.feed,
    liveAuctions: result.liveAuctions,
    budgets: result.budgets,
    mix: result.mix,
  });
}
