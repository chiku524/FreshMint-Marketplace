import { getSessionUser } from "@/lib/auth/session";
import { withdrawPurchaseToWallet } from "@/lib/marketplace/service";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  purchaseId: z.string().min(1),
  destinationAddress: z.string().min(4).optional(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = bodySchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await withdrawPurchaseToWallet({
    purchaseId: body.data.purchaseId,
    buyerId: user.id,
    destinationAddress: body.data.destinationAddress,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
