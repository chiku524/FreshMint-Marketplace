import { getSessionUser } from "@/lib/auth/session";
import { updateListingSaleMode } from "@/lib/marketplace/service";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  saleMode: z.enum(["fixed", "timed_window", "english"]),
  startingBidUsd: z.number().nonnegative().nullable().optional(),
  reserveUsd: z.number().nonnegative().nullable().optional(),
  auctionStartsAt: z.string().nullable().optional(),
  auctionEndsAt: z.string().nullable().optional(),
  priceUsd: z.number().nonnegative().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const result = await updateListingSaleMode({
    listingId: id,
    creatorId: user.id,
    ...parsed.data,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
