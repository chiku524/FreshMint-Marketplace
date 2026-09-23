import { getSessionUser } from "@/lib/auth/session";
import {
  boostConfirmSchema,
  readJsonBody,
} from "@/lib/marketplace/boost-request";
import { confirmFeaturedBoost } from "@/lib/marketplace/featured-boost";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Confirm Featured boost after native payment to the platform treasury. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = boostConfirmSchema.safeParse(await readJsonBody(req));
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await confirmFeaturedBoost({
    actorId: user.id,
    listingId: id,
    payNetwork: body.data.payNetwork,
    txHash: body.data.txHash,
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
  return NextResponse.json(result);
}
