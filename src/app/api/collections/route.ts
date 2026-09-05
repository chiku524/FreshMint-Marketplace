import { getSessionUser } from "@/lib/auth/session";
import { isNetworkId, resolveNetwork, vmFromNetwork } from "@/lib/chains/registry";
import type { NetworkId } from "@/lib/discovery/types";
import {
  createCollectionForUser,
  getDiscoveryEngine,
  listCollectionsForUser,
} from "@/lib/marketplace/service";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const mine = req.nextUrl.searchParams.get("mine") === "1";
  if (mine) {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.json({
      collections: await listCollectionsForUser(user.id),
    });
  }

  const engine = await getDiscoveryEngine();
  return NextResponse.json({
    collections: [...engine.state.collections.values()],
  });
}

const createSchema = z
  .object({
    title: z.string().min(1).max(120),
    chain: z.enum(["evm", "solana", "boing"]).optional(),
    network: z
      .enum(["ethereum", "base", "arbitrum", "optimism", "solana", "boing"])
      .optional(),
  })
  .refine((v) => Boolean(v.network || v.chain), {
    message: "network_required",
    path: ["network"],
  });

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = createSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json(
      { error: "invalid_body", details: body.error.flatten() },
      { status: 400 },
    );
  }

  const network = resolveNetwork(body.data.network, body.data.chain) as NetworkId;
  if (!isNetworkId(network)) {
    return NextResponse.json({ error: "invalid_network" }, { status: 400 });
  }

  const result = await createCollectionForUser({
    creatorId: user.id,
    title: body.data.title,
    network,
    chain: vmFromNetwork(network),
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });
  }
  return NextResponse.json({ ok: true, collection: result.collection });
}
