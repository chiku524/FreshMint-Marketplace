import { getEngine } from "@/lib/data/store";
import { NextResponse } from "next/server";

export async function GET() {
  const engine = getEngine();
  return NextResponse.json({
    config: {
      emerging: engine.getConfig().emerging,
      emergingRisingQuota: engine.getConfig().emergingRisingQuota,
      feedMix: engine.getConfig().feedMix,
      risingSlotsPerDay: engine.getConfig().risingSlotsPerDay,
      featuredSlotsPerDay: engine.getConfig().featuredSlotsPerDay,
    },
    budgets: engine.getBudgets(),
    metrics: engine.metrics.snapshot(),
  });
}
