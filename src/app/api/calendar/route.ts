import { getDropCalendar } from "@/lib/marketplace/calendar";
import { NextResponse } from "next/server";

export async function GET() {
  const calendar = await getDropCalendar();
  return NextResponse.json(calendar);
}
