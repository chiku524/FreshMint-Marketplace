import { getSessionUser } from "@/lib/auth/session";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import { addListingToShelf, createShelf } from "@/lib/marketplace/editorial";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export async function GET() {
  const engine = await getDiscoveryEngine();
  return NextResponse.json({
    shelves: [...engine.state.shelves.values()],
  });
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  listingIds: z.array(z.string()).default([]),
});

const addSchema = z.object({
  shelfId: z.string(),
  listingId: z.string(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await req.json();
  if (json.shelfId && json.listingId) {
    const body = addSchema.safeParse(json);
    if (!body.success) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const result = await addListingToShelf({
      shelfId: body.data.shelfId,
      curatorId: user.id,
      listingId: body.data.listingId,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  const body = createSchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const result = await createShelf({
    curatorId: user.id,
    name: body.data.name,
    listingIds: body.data.listingIds,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
