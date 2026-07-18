import { getEngine } from "@/lib/data/store";
import type { LaunchStage } from "@/lib/discovery/types";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { target: LaunchStage };
  const engine = getEngine();
  const result = engine.transitionListing(id, body.target);
  if (!result.ok) {
    return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });
  }
  return NextResponse.json({ ok: true, listing: result.listing });
}
