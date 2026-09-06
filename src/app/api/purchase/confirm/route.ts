import { getSessionUser } from "@/lib/auth/session";
import {
  purchaseConfirmSchema,
  readJsonBody,
} from "@/lib/marketplace/purchase-request";
import { confirmCryptoPurchase } from "@/lib/marketplace/service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = purchaseConfirmSchema.safeParse(await readJsonBody(req));
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await confirmCryptoPurchase({
    purchaseId: body.data.purchaseId,
    buyerId: user.id,
    step: body.data.step,
    txHash: body.data.txHash,
    bridgeRequestId: body.data.bridgeRequestId,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
