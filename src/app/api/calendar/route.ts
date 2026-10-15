import { getDropCalendar } from "@/lib/marketplace/calendar";
import { NextResponse } from "next/server";

export async function GET() {
  const calendar = await getDropCalendar();
  // Public, viewer-independent schedule; short CDN cache absorbs traffic spikes.
  return NextResponse.json(calendar, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
