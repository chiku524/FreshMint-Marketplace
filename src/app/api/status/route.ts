import { NextResponse } from "next/server";
import { ensureDatabaseReady, isDatabaseDegraded } from "@/lib/db-ready";

export const dynamic = "force-dynamic";

/**
 * Cheap status for the client maintenance banner. Uses the cached readiness
 * verdict (no per-request DB query); /api/health does the live probe.
 */
export async function GET() {
  await ensureDatabaseReady();
  return NextResponse.json(
    { degraded: isDatabaseDegraded() },
    { headers: { "Cache-Control": "no-store" } },
  );
}