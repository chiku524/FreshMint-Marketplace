import { canUserStageListing } from "@/lib/marketplace/lifecycle";
import { getSessionUser } from "@/lib/auth/session";
import { getDiscoveryEngine, transitionListingStage } from "@/lib/marketplace/service";
import type { LaunchStage } from "@/lib/discovery/types";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  target: z.enum([
    "soft_launch",
    "rising_eligible",
    "featured_eligible",
    "featured",
  ]),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const engine = await getDiscoveryEngine();
  const listing = engine.state.listings.get(id);
  if (!listing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!canUserStageListing(user, listing)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await transitionListingStage(
    id,
    body.data.target as LaunchStage,
  );
  if (!result.ok) {
    return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    listing: result.listing,
  });
}
