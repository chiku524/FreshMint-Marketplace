import { getPersistedMetrics } from "@/lib/marketplace/service";
import { NextResponse } from "next/server";

export async function GET() {
  const data = await getPersistedMetrics();
  return NextResponse.json(data);
}
