import { prisma } from "@/lib/db";
import { nextCursor, parsePage } from "@/lib/http/pagination";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/collections/:id/listings?limit=&cursor= — paginated listings of
 * one collection (newest first). Non-owners only see published, non-delisted
 * items. Uses the cached engine snapshot, so paging a 10k collection costs no
 * extra per-page table scans.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { limit, offset } = parsePage(req.nextUrl.searchParams, {
    defaultLimit: 100,
    maxLimit: 500,
  });
  const { getSessionUser } = await import("@/lib/auth/session");
  const user = await getSessionUser(req);
  const engine = await getDiscoveryEngine();
  const collection =
    engine.state.collections.get(id) ??
    [...engine.state.collections.values()].find((c) => c.slug === id);
  if (!collection) {
    // Fresh collection not yet in the snapshot: confirm it exists in the DB.
    const exists = await prisma.collection
      .findUnique({ where: { id }, select: { id: true } })
      .catch(() => null);
    if (!exists) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ items: [], total: 0, nextCursor: null });
  }
  const isOwner = user?.id === collection.creatorId;
  const all = [...engine.state.listings.values()]
    .filter(
      (l) =>
        l.collectionId === collection.id &&
        (isOwner || (l.stage !== "draft" && !l.delisted)),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
  return NextResponse.json({
    items: all.slice(offset, offset + limit),
    total: all.length,
    nextCursor: nextCursor(offset, limit, all.length),
  });
}