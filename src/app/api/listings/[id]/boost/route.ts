import { getSessionUser } from "@/lib/auth/session";
import { requestFeaturedBoost } from "@/lib/marketplace/featured-boost";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const result = await requestFeaturedBoost({
    actorId: user.id,
    listingId: id,
  });
  if (!result.ok) {
    const status =
      result.error === "forbidden"
        ? 403
        : result.error === "unavailable"
          ? 404
          : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({
    ok: true,
    listing: result.listing,
    feeUsd: result.feeUsd,
    settlement: result.settlement,
  });
}
