import { getSessionUser } from "@/lib/auth/session";
import { recordSignal } from "@/lib/marketplace/service";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  listingId: z.string(),
  type: z.enum(["impression", "meaningful_view", "save", "follow", "dwell"]),
  dwellMs: z.number().int().nonnegative().optional(),
  bucket: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const body = schema.safeParse(await req.json());
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
    return NextResponse.json(result, { status: 404 });
  }
  return NextResponse.json(result);
}
