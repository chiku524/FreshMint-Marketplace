import { getSessionUser } from "@/lib/auth/session";
import { followArtist, unfollowArtist } from "@/lib/marketplace/service";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  artistId: z.string().min(1),
  unfollow: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = body.data.unfollow
    ? await unfollowArtist({
        followerId: user.id,
        artistId: body.data.artistId,
      })
    : await followArtist({
        followerId: user.id,
        artistId: body.data.artistId,
      });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
