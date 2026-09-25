import {
  AccountError,
  updateAvatarUrl,
  updateDisplayName,
  updateCreatorProfileFields,
} from "@/lib/auth/account";
import { getSessionUser } from "@/lib/auth/session";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const optionalUrl = z
  .union([z.string().max(2048), z.null()])
  .optional()
  .transform((v) => (v === "" ? null : v));

const schema = z
  .object({
    displayName: z.string().trim().min(1).max(64).optional(),
    avatarUrl: z.union([z.string().max(2048), z.null()]).optional(),
    bio: z.string().max(500).optional(),
    websiteUrl: optionalUrl,
    twitterUrl: optionalUrl,
    farcasterUrl: optionalUrl,
  })
  .refine(
    (body) =>
      body.displayName !== undefined ||
      body.avatarUrl !== undefined ||
      body.bio !== undefined ||
      body.websiteUrl !== undefined ||
      body.twitterUrl !== undefined ||
      body.farcasterUrl !== undefined,
    { message: "empty_patch" },
  );

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const out: Record<string, unknown> = { ok: true };
    if (body.data.displayName !== undefined) {
      await updateDisplayName({
        userId: user.id,
        displayName: body.data.displayName,
      });
      out.displayName = body.data.displayName;
    }
    if (body.data.avatarUrl !== undefined) {
      out.avatarUrl = await updateAvatarUrl({
        userId: user.id,
        avatarUrl: body.data.avatarUrl,
      });
    }
    if (
      body.data.bio !== undefined ||
      body.data.websiteUrl !== undefined ||
      body.data.twitterUrl !== undefined ||
      body.data.farcasterUrl !== undefined
    ) {
      const fields = await updateCreatorProfileFields({
        userId: user.id,
        bio: body.data.bio,
        websiteUrl: body.data.websiteUrl,
        twitterUrl: body.data.twitterUrl,
        farcasterUrl: body.data.farcasterUrl,
      });
      Object.assign(out, fields);
    }
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof AccountError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}
