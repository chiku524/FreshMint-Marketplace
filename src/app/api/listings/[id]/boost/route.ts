import { invalidBody } from "@/lib/http/json";
import { getSessionUser } from "@/lib/auth/session";
import {
  boostPrepareSchema,
  readJsonBody,
} from "@/lib/marketplace/boost-request";
import { prepareFeaturedBoost } from "@/lib/marketplace/featured-boost";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Prepare Featured boost treasury payment (does not activate the boost). */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = boostPrepareSchema.safeParse(await readJsonBody(req));
  if (!body.success) {
    return invalidBody(body.error);
  }

  const result = await prepareFeaturedBoost({
    actorId: user.id,
    listingId: id,
    payNetwork: body.data.payNetwork,
    fromAddress: body.data.fromAddress,
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
