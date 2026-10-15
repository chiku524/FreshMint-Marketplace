import { getSessionUser } from "@/lib/auth/session";
import {
  prepareCollectionPublishMints,
  softLaunchMintedDraftsInCollection,
} from "@/lib/marketplace/service";
import { resolveNetwork, vmFromNetwork } from "@/lib/chains/registry";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const softLaunchSchema = z.object({
  action: z.literal("soft_launch_minted"),
});

const prepareSchema = z.object({
  action: z.literal("prepare_remaining"),
  listingIds: z.array(z.string().min(1)).min(1).optional(),
  creatorAddress: z.string().min(1).max(128).optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const action = String(json?.action ?? "");

  if (action === "soft_launch_minted") {
    const body = softLaunchSchema.safeParse(json);
    if (!body.success) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const result = await softLaunchMintedDraftsInCollection({
      collectionId: id,
      creatorId: user.id,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  }

  if (action === "prepare_remaining") {
    const body = prepareSchema.safeParse(json);
    if (!body.success) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const creatorAddress =
      body.data.creatorAddress ||
      user.wallets.find((w) => {
        const net = resolveNetwork(undefined, w.chain as "evm" | "solana" | "boing");
        return vmFromNetwork(net) === w.chain;
      })?.address ||
      user.wallets[0]?.address ||
      null;

    const result = await prepareCollectionPublishMints({
      collectionId: id,
      creatorId: user.id,
      listingIds: body.data.listingIds ?? [],
      creatorAddress,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
