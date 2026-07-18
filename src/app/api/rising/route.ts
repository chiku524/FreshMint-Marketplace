import { getEngine } from "@/lib/data/store";
import { emergingShare } from "@/lib/discovery";
import { NextResponse } from "next/server";

export async function GET() {
  const engine = getEngine();
  const rising = engine.buildRising();
  return NextResponse.json({
    items: rising,
    emergingShare: emergingShare(rising),
    budgets: engine.getBudgets(),
  });
}
