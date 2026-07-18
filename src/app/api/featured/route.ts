import { getEngine } from "@/lib/data/store";
import { NextResponse } from "next/server";

export async function GET() {
  const engine = getEngine();
  return NextResponse.json({
    items: engine.buildFeatured(),
    budgets: engine.getBudgets(),
  });
}
