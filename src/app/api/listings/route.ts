import { getEngine } from "@/lib/data/store";
import type { Listing } from "@/lib/discovery/types";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const engine = getEngine();
  return NextResponse.json({
    items: [...engine.state.listings.values()],
    creators: [...engine.state.creators.values()],
    collections: [...engine.state.collections.values()],
    shelves: [...engine.state.shelves.values()],
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Listing;
  const engine = getEngine();
  const result = engine.createListing(body);
  if (!result.ok) {
    return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });
  }
  return NextResponse.json({ ok: true, listing: result.listing });
}
