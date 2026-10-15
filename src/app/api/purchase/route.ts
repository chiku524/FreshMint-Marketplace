import { limitByUserOrIp } from "@/lib/http/rate-limit";
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
  const limited = await limitByUserOrIp(req, user.id, "purchase", 20, 60_000);
  if (limited) return limited;
  const body = purchaseBodySchema.safeParse(await readJsonBody(req));
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await purchaseListing({
    listingId: body.data.listingId,
    buyerId: user.id,
    payNetwork: body.data.payNetwork,
    buyerPaymentAddress: body.data.buyerPaymentAddress,
    buyerReceiveAddress: body.data.buyerReceiveAddress,
    amountUsd: body.data.amountUsd,
    simulate: body.data.simulate,
    paymentTxHash: body.data.paymentTxHash,
    transferTxHash: body.data.transferTxHash,
    bridgeRequestId: body.data.bridgeRequestId,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
