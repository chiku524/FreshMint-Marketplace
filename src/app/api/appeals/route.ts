import { getSessionUser } from "@/lib/auth/session";
import { submitListingAppeal } from "@/lib/marketplace/moderation";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  listingId: z.string(),
  message: z.string().min(8).max(2000),
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

  const result = await submitListingAppeal({
    listingId: body.data.listingId,
    creatorId: user.id,
    message: body.data.message,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
