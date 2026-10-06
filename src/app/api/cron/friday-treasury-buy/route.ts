import { assertCronAuthorized } from "@/lib/marketplace/settle-cron";
import { runFridayTreasuryBuys } from "@/lib/marketplace/friday-treasury-buy";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = assertCronAuthorized(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const force = req.nextUrl.searchParams.get("force") === "1";
  const result = await runFridayTreasuryBuys({ force });
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
