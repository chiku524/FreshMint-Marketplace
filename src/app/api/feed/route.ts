import { getDiscoveryEngine } from "@/lib/marketplace/service";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const viewerId = req.nextUrl.searchParams.get("viewerId");
  const pageSize = Number(req.nextUrl.searchParams.get("pageSize") ?? "20");
  const engine = await getDiscoveryEngine();
  const result = engine.buildHomepage(viewerId, pageSize);

  // Persist impressions for Phase 2 metrics durability
  for (const item of result.feed) {
    await prisma.signalEvent.create({
      data: {
        type: "impression",
        listingId: item.listing.id,
        creatorId: item.listing.creatorId,
        viewerId: viewerId,
        emerging: item.emerging,
        bucket: String(item.bucket),
      },
    });
    await prisma.listing.update({
      where: { id: item.listing.id },
      data: {
        impressionsToday: { increment: 1 },
        impressionsThisWeek: { increment: 1 },
      },
    });
  }

  return NextResponse.json({
    feed: result.feed,
    liveAuctions: result.liveAuctions,
    budgets: result.budgets,
    mix: result.mix,
  });
}
