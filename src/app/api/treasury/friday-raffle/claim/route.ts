import { getSessionUser } from "@/lib/auth/session";
import { claimFridayRafflePrize } from "@/lib/marketplace/friday-treasury-raffle";
import { readJsonBody } from "@/lib/marketplace/purchase-request";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  windowId: z.string().trim().min(8).max(16),
  claimAddress: z.string().trim().min(8).max(128),
});

/** Winner records a linked wallet claim for that Friday’s prize. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = schema.safeParse(await readJsonBody(req));
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const result = await claimFridayRafflePrize({
    windowId: body.data.windowId,
    userId: user.id,
    claimAddress: body.data.claimAddress,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status ?? 400 },
    );
  }
  return NextResponse.json({ ok: true, raffle: result.raffle });
}
