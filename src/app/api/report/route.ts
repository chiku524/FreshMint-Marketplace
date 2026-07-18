import { getEngine } from "@/lib/data/store";
import type { ReportReason } from "@/lib/discovery/types";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    listingId: string;
    reporterId: string;
    reason: ReportReason;
  };
  const engine = getEngine();
  const result = engine.reportListing({
    id: `report-${Date.now()}`,
    ...body,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
  }
  return NextResponse.json(result);
}
