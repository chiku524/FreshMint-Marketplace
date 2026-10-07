import { getTreasuryPublicOverview } from "@/lib/marketplace/treasury-public";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Public treasury addresses, balances, and activity ledger. */
export async function GET(req: NextRequest) {
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 24;
  const overview = await getTreasuryPublicOverview({
    activityLimit: Number.isFinite(limit) ? limit : 24,
  });
  return NextResponse.json({ ok: true, ...overview });
}
