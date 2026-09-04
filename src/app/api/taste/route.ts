import { getSessionUser } from "@/lib/auth/session";
import { DISCOVERY_CONFIG } from "@/lib/discovery";
import { readViewerTaste, writeViewerTaste } from "@/lib/discovery/cookies";
import { normalizeTaste } from "@/lib/discovery/taste";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  styleTags: z.array(z.string()).max(8).default([]),
  medium: z.string().max(40).optional().nullable(),
  maxPriceUsd: z.number().nonnegative().optional().nullable(),
});

export async function GET() {
  const taste = await readViewerTaste();
  return NextResponse.json({ taste, seedTags: DISCOVERY_CONFIG.taste.seedTags });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const taste = normalizeTaste(body.data);
  await writeViewerTaste(taste);
  return NextResponse.json({ taste, viewerId: user?.id ?? null });
}
