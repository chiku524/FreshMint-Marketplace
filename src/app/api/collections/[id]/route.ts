import { getSessionUser } from "@/lib/auth/session";
import {
  updateCollectionDrop,
  updateCollectionProfile,
} from "@/lib/marketplace/service";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const optionalUrl = z
  .union([z.string().max(2048), z.null()])
  .optional()
  .transform((v) => (v === "" ? null : v));

const dropSchema = z.object({
  dropKind: z.enum(["limited", "open"]),
  dropStartsAt: z.string().min(1),
  dropEndsAt: z.string().min(1),
  dropPriceUsd: z.number().nonnegative().nullable().optional(),
});

const profileSchema = z
  .object({
    description: z.string().max(2000).optional(),
    imageUrl: optionalUrl,
    bannerUrl: optionalUrl,
    websiteUrl: optionalUrl,
    twitterUrl: optionalUrl,
    discordUrl: optionalUrl,
    instagramUrl: optionalUrl,
  })
  .refine(
    (body) =>
      body.description !== undefined ||
      body.imageUrl !== undefined ||
      body.bannerUrl !== undefined ||
      body.websiteUrl !== undefined ||
      body.twitterUrl !== undefined ||
      body.discordUrl !== undefined ||
      body.instagramUrl !== undefined,
    { message: "empty_patch" },
  );

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const json = await req.json();

  const dropBody = dropSchema.safeParse(json);
  if (dropBody.success) {
    const result = await updateCollectionDrop({
      collectionId: id,
      creatorId: user.id,
      dropKind: dropBody.data.dropKind,
      dropStartsAt: dropBody.data.dropStartsAt,
      dropEndsAt: dropBody.data.dropEndsAt,
      dropPriceUsd: dropBody.data.dropPriceUsd,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, errors: result.errors },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, collection: result.collection });
  }

  const profileBody = profileSchema.safeParse(json);
  if (!profileBody.success) {
    return NextResponse.json(
      { error: "invalid_body", details: profileBody.error.flatten() },
      { status: 400 },
    );
  }

  const result = await updateCollectionProfile({
    collectionId: id,
    creatorId: user.id,
    description: profileBody.data.description,
    imageUrl: profileBody.data.imageUrl,
    bannerUrl: profileBody.data.bannerUrl,
    websiteUrl: profileBody.data.websiteUrl,
    twitterUrl: profileBody.data.twitterUrl,
    discordUrl: profileBody.data.discordUrl,
    instagramUrl: profileBody.data.instagramUrl,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });
  }
  return NextResponse.json({ ok: true, collection: result.collection });
}
