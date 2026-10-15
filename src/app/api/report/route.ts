import { limitByUserOrIp } from "@/lib/http/rate-limit";
import { readJsonBody } from "@/lib/http/json";
import { getSessionUser } from "@/lib/auth/session";
import { reportListingForUser } from "@/lib/marketplace/service";
import type { ReportReason } from "@/lib/discovery/types";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  listingId: z.string(),
  reason: z.enum([
    "spam",
    "stolen_art",
    "duplicate",
    "policy_violation",
    "other",
  ]),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const limited = await limitByUserOrIp(req, user.id, "report", 10, 60 * 60_000);
  if (limited) return limited;
  const body = schema.safeParse(await readJsonBody(req));
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await reportListingForUser({
    listingId: body.data.listingId,
    reporterId: user.id,
    reason: body.data.reason as ReportReason,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
  }
  return NextResponse.json(result);
}
