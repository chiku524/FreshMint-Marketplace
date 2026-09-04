import { getSessionUser } from "@/lib/auth/session";
import {
  appendSeenFromFeed,
  readViewerSession,
  writeViewerSession,
} from "@/lib/discovery/cookies";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  listingIds: z.array(z.string()).max(80).default([]),
  artistIds: z.array(z.string()).max(80).default([]),
  collectionIds: z.array(z.string()).max(80).default([]),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const current = await readViewerSession(user?.id ?? null);
  const items = body.data.listingIds.map((id, i) => ({
    listing: {
      id,
      creatorId: body.data.artistIds[i] ?? id,
      collectionId: body.data.collectionIds[i] ?? null,
    },
  }));
  const next = appendSeenFromFeed(current, items);
  await writeViewerSession(next);
  return NextResponse.json({
    seenArtistIds: next.seenArtistIds.length,
    seenListingIds: next.seenListingIds.length,
  });
}
