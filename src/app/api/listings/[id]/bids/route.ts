import { getSessionUser } from "@/lib/auth/session";
import { lazySettleEnglishAuction, listBidsForListing, placeBid } from "@/lib/marketplace/english-auction";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const settle = await lazySettleEnglishAuction(id);
  const bids = await listBidsForListing(id, 50);
  return NextResponse.json({
    ok: true,
    bids,
    settle: {
      label: settle.settleLabel,
      outcome: settle.outcome,
      purchaseId: settle.purchaseId,
      purchaseStatus: settle.purchaseStatus,
      created: settle.created,
      paymentDeadlineAt: settle.paymentDeadlineAt,
      cascaded: settle.cascaded,
      expiredWinnerId: settle.expiredWinnerId,
    },
  });
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
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const result = await placeBid({
    listingId: id,
    bidderId: user.id,
    amountUsd: parsed.data.amountUsd,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
