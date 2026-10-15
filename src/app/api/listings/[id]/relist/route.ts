import { invalidBody, readJsonBody } from "@/lib/http/json";
import { getSessionUser } from "@/lib/auth/session";
import { relistListingForSale } from "@/lib/marketplace/listing-manage";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  priceUsd: z.number().positive().max(1_000_000).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = bodySchema.safeParse((await readJsonBody(req)) ?? {});
  if (!parsed.success) {
    return invalidBody(parsed.error);
  }
  const result = await relistListingForSale({
    listingId: id,
    actorId: user.id,
    priceUsd: parsed.data.priceUsd,
  });
  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "forbidden"
          ? 403
          : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
