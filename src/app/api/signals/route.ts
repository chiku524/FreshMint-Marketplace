import { limitByUserOrIp } from "@/lib/http/rate-limit";
import { readJsonBody } from "@/lib/http/json";
import { getSessionUser } from "@/lib/auth/session";
import { recordSignal } from "@/lib/marketplace/service";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  listingId: z.string(),
  type: z.enum([
    "impression",
    "page_view",
    "meaningful_view",
    "save",
    "follow",
    "dwell",
  ]),
  dwellMs: z.number().int().nonnegative().optional(),
  bucket: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  // Impressions are chatty; this only stops scripted signal flooding.
  const limited = await limitByUserOrIp(req, user?.id, "signals", 300, 60_000);
  if (limited) return limited;
  const body = schema.safeParse(await readJsonBody(req));
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await recordSignal({
    listingId: body.data.listingId,
    viewerId: user?.id ?? null,
    type: body.data.type,
    dwellMs: body.data.dwellMs,
    bucket: body.data.bucket,
  });

  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
