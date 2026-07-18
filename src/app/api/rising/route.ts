import { emergingShare } from "@/lib/discovery";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import { NextResponse } from "next/server";

export async function GET() {
  const engine = await getDiscoveryEngine();
  const rising = engine.buildRising();
  return NextResponse.json({
    items: rising,
    emergingShare: emergingShare(rising),
    budgets: engine.getBudgets(),
  });
}
