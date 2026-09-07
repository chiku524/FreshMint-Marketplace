import { getSessionUser } from "@/lib/auth/session";
import { readJsonBody } from "@/lib/marketplace/purchase-request";
import { resumeCryptoPurchase } from "@/lib/marketplace/service";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  purchaseId: z.string().trim().min(1),
  buyerPaymentAddress: z.string().trim().min(1).optional(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = schema.safeParse(await readJsonBody(req));
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await resumeCryptoPurchase({
    purchaseId: body.data.purchaseId,
    buyerId: user.id,
    buyerPaymentAddress: body.data.buyerPaymentAddress,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
