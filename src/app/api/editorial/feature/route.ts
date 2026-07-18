import { getSessionUser } from "@/lib/auth/session";
import { featureListing, unfeatureListing } from "@/lib/marketplace/editorial";
import { canEditFeatured } from "@/lib/marketplace/moderation";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  listingId: z.string(),
  action: z.enum(["feature", "unfeature"]).default("feature"),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !canEditFeatured(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result =
    body.data.action === "unfeature"
      ? await unfeatureListing({
          actorId: user.id,
          listingId: body.data.listingId,
        })
      : await featureListing({
          actorId: user.id,
          listingId: body.data.listingId,
        });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
