import { getSessionUser } from "@/lib/auth/session";
import { updateCollectionDrop } from "@/lib/marketplace/service";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const dropSchema = z.object({
  dropKind: z.enum(["limited", "open"]),
  dropStartsAt: z.string().min(1),
  dropEndsAt: z.string().min(1),
  dropPriceUsd: z.number().nonnegative().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = dropSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json(
      { error: "invalid_body", details: body.error.flatten() },
      { status: 400 },
    );
  }

  const result = await updateCollectionDrop({
    collectionId: id,
    creatorId: user.id,
    dropKind: body.data.dropKind,
    dropStartsAt: body.data.dropStartsAt,
    dropEndsAt: body.data.dropEndsAt,
    dropPriceUsd: body.data.dropPriceUsd,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });
  }
  return NextResponse.json({ ok: true, collection: result.collection });
}
