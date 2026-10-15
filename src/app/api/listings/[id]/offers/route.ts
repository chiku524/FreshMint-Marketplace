import { invalidBody, readJsonBody } from "@/lib/http/json";
import { getSessionUser } from "@/lib/auth/session";
import { listOffersForListing, makeOffer } from "@/lib/marketplace/offers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const offers = await listOffersForListing(id, 50);
  return NextResponse.json({ ok: true, offers });
}

const bodySchema = z.object({
  amountUsd: z.coerce.number().positive(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = bodySchema.safeParse(await readJsonBody(req));
  if (!parsed.success) {
    return invalidBody(parsed.error);
  }
  const result = await makeOffer({
    listingId: id,
    offererId: user.id,
    amountUsd: parsed.data.amountUsd,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
