import { getSessionUser } from "@/lib/auth/session";
import { vmFromNetwork, resolveNetwork } from "@/lib/chains/registry";
import {
  confirmCollectionMintBatch,
  prepareCollectionPublishMints,
} from "@/lib/marketplace/service";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const prepareSchema = z.object({
  listingIds: z.array(z.string().min(1)).min(1),
  creatorAddress: z.string().min(1).max(128).optional(),
});

const confirmSchema = z.object({
  txHash: z.string().min(8),
  listingIds: z.array(z.string().min(1)).min(1),
  tokenIds: z.array(z.string()).optional(),
  contractAddress: z.string().min(1).optional(),
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
  const json = await req.json();
  const action = String(json.action ?? "prepare");

  if (action === "confirm") {
    const body = confirmSchema.safeParse(json);
    if (!body.success) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const result = await confirmCollectionMintBatch({
      collectionId: id,
      creatorId: user.id,
      txHash: body.data.txHash,
      listingIds: body.data.listingIds,
      tokenIds: body.data.tokenIds,
      contractAddress: body.data.contractAddress,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  }

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
    listingIds: body.data.listingIds,
    creatorAddress,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
