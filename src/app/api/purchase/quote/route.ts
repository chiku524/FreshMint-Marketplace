import { getSessionUser } from "@/lib/auth/session";
import {
  purchaseQuoteSchema,
  readJsonBody,
} from "@/lib/marketplace/purchase-request";
import { quoteCryptoPurchase } from "@/lib/marketplace/service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = purchaseQuoteSchema.safeParse(await readJsonBody(req));
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await quoteCryptoPurchase({
    listingId: body.data.listingId,
    payNetwork: body.data.payNetwork,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
