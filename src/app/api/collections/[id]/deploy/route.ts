import { getSessionUser } from "@/lib/auth/session";
import {
  confirmCollectionDeploy,
  getDiscoveryEngine,
  prepareCollectionDeployForUser,
  syncCollectionDeployFromChain,
} from "@/lib/marketplace/service";
import { resolveNetwork, vmFromNetwork } from "@/lib/chains/registry";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const confirmSchema = z.object({
  txHash: z.string().min(8),
  contractAddress: z.string().min(1).optional(),
  escrowAddress: z.string().min(1).optional(),
  creatorAddress: z.string().min(1).optional(),
});

const syncSchema = z.object({
  action: z.literal("sync"),
  creatorAddress: z.string().min(1).optional(),
  contractAddress: z.string().min(1).optional(),
  txHash: z.string().min(8).optional(),
});

const prepareSchema = z.object({
  action: z.literal("prepare"),
  creatorAddress: z.string().min(1).optional(),
});

async function creatorAddressForCollection(
  user: Awaited<ReturnType<typeof getSessionUser>>,
  collectionId: string,
  explicit?: string | null,
): Promise<string | null> {
  if (!user) return null;
  if (explicit?.trim()) return explicit.trim();
  const engine = await getDiscoveryEngine();
  const collection = engine.state.collections.get(collectionId);
  const chain = collection
    ? vmFromNetwork(resolveNetwork(collection.network, collection.chain))
    : null;
  return (
    (chain && user.wallets.find((w) => w.chain === chain)?.address) ||
    user.wallets[0]?.address ||
    null
  );
}

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

  const syncBody = syncSchema.safeParse(json);
  if (syncBody.success) {
    const creatorAddress = await creatorAddressForCollection(
      user,
      id,
      syncBody.data.creatorAddress,
    );
    const result = await syncCollectionDeployFromChain({
      collectionId: id,
      creatorId: user.id,
      creatorAddress,
      contractAddress: syncBody.data.contractAddress,
      txHash: syncBody.data.txHash,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  }

  const prepareBody = prepareSchema.safeParse(json);
  if (prepareBody.success) {
    const creatorAddress = await creatorAddressForCollection(
      user,
      id,
      prepareBody.data.creatorAddress,
    );
    const result = await prepareCollectionDeployForUser({
      collectionId: id,
      creatorId: user.id,
      creatorAddress,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  }

  const body = confirmSchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const creatorAddress = await creatorAddressForCollection(
    user,
    id,
    body.data.creatorAddress,
  );

  const result = await confirmCollectionDeploy({
    collectionId: id,
    creatorId: user.id,
    txHash: body.data.txHash,
    contractAddress: body.data.contractAddress,
    escrowAddress: body.data.escrowAddress,
    creatorAddress,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
