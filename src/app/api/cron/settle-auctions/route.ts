import {
  assertCronAuthorized,
  settleEndedEnglishAuctions,
} from "@/lib/marketplace/settle-cron";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = assertCronAuthorized(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : 50;
  const result = await settleEndedEnglishAuctions({
    limit: Number.isFinite(limit) ? limit : 50,
  });
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
