import { ensureDatabaseReady } from "@/lib/db-ready";
import { isPostgresConfigured } from "@/lib/env";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function probeDatabase(): Promise<"ok" | "unreachable" | "not_configured"> {
  if (!isPostgresConfigured()) return "not_configured";
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
    ]);
    return "ok";
  } catch {
    return "unreachable";
  }
}

/**
 * Public liveness probe. Deliberately minimal: no hostnames, env flags,
 * contract addresses, or other infrastructure details.
 */
export async function GET() {
  await ensureDatabaseReady();
  const database = await probeDatabase();
  const degraded = database === "unreachable";
  return NextResponse.json(
    { ok: !degraded, database, timestamp: new Date().toISOString() },
    { status: degraded ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
