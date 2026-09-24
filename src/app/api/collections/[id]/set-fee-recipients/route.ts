import { getSessionUser } from "@/lib/auth/session";
import { prepareCollectionSetFeeRecipients } from "@/lib/marketplace/set-fee-recipients";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  fromAddress: z.string().min(1).max(128),
});

/** Prepare setFeeRecipients wallet tx for the collection owner (EVM only). */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await prepareCollectionSetFeeRecipients({
    actorId: user.id,
    collectionId: id,
    fromAddress: body.data.fromAddress,
  });
  if (!result.ok) {
    const status =
      result.error === "forbidden"
        ? 403
        : result.error === "collection_not_found"
          ? 404
          : result.error === "not_onchain_owner"
            ? 403
            : 400;
    return NextResponse.json(
      {
        error: result.error,
        ...(result.connected ? { connected: result.connected } : {}),
        ...(result.onchainOwner ? { onchainOwner: result.onchainOwner } : {}),
      },
      { status },
    );
  }
  return NextResponse.json(result);
}
