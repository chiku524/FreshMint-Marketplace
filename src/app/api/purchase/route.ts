import { getSessionUser } from "@/lib/auth/session";
import {
  purchaseBodySchema,
  readJsonBody,
} from "@/lib/marketplace/purchase-request";
import { purchaseListing } from "@/lib/marketplace/service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = purchaseBodySchema.safeParse(await readJsonBody(req));
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await purchaseListing({
    listingId: body.data.listingId,
    buyerId: user.id,
    amountUsd: body.data.amountUsd,
    txHash: body.data.txHash,
    buyerAddress: body.data.buyerAddress,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
