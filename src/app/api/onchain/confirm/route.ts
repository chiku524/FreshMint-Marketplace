import { getSessionUser } from "@/lib/auth/session";
import { confirmOnchainTx } from "@/lib/marketplace/service";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  listingId: z.string().min(1),
  action: z.enum(["mint", "buy"]),
  txHash: z.string().min(8),
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

  const result = await confirmOnchainTx({
    listingId: body.data.listingId,
    action: body.data.action,
    txHash: body.data.txHash,
    buyerId: user.id,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
