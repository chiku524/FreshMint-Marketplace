import { getSessionUser } from "@/lib/auth/session";
import { isNetworkId, resolveNetwork, vmFromNetwork } from "@/lib/chains/registry";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import { createListingForUser } from "@/lib/marketplace/service";
import type { ListingType, NetworkId } from "@/lib/discovery/types";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export async function GET() {
  const engine = await getDiscoveryEngine();
  return NextResponse.json({
    items: [...engine.state.listings.values()],
    creators: [...engine.state.creators.values()],
    collections: [...engine.state.collections.values()],
    shelves: [...engine.state.shelves.values()],
  });
}

const createSchema = z
  .object({
    title: z.string().min(1).max(120),
    description: z.string().max(2000).default(""),
    type: z.enum(["single", "collection", "open_edition", "auction"]),
    chain: z.enum(["evm", "solana"]).optional(),
    network: z
      .enum(["ethereum", "base", "arbitrum", "optimism", "solana"])
      .optional(),
    priceUsd: z.number().nonnegative().nullable().optional(),
    medium: z.string().min(1).max(64),
    styleTags: z.array(z.string()).default([]),
    mediaContent: z.string().optional(),
    mediaHash: z.string().optional(),
    mediaUrl: z.string().optional(),
    oeStartsAt: z.string().nullable().optional(),
    oeEndsAt: z.string().nullable().optional(),
    auctionStartsAt: z.string().nullable().optional(),
    auctionEndsAt: z.string().nullable().optional(),
    publishSoftLaunch: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.mediaHash || v.mediaContent), {
    message: "media_required",
    path: ["mediaContent"],
  })
  .refine((v) => Boolean(v.network || v.chain), {
    message: "network_required",
    path: ["network"],
  });

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
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

  const network = resolveNetwork(
    body.data.network,
    body.data.chain,
  ) as NetworkId;
  if (!isNetworkId(network)) {
    return NextResponse.json({ error: "invalid_network" }, { status: 400 });
  }

  const result = await createListingForUser({
    creatorId: user.id,
    title: body.data.title,
    description: body.data.description,
    type: body.data.type as ListingType,
    network,
    chain: vmFromNetwork(network),
    priceUsd: body.data.priceUsd,
    medium: body.data.medium,
    styleTags: body.data.styleTags,
    mediaContent: body.data.mediaContent,
    mediaHash: body.data.mediaHash,
    mediaUrl: body.data.mediaUrl,
    oeStartsAt: body.data.oeStartsAt,
    oeEndsAt: body.data.oeEndsAt,
    auctionStartsAt: body.data.auctionStartsAt,
    auctionEndsAt: body.data.auctionEndsAt,
    publishSoftLaunch: body.data.publishSoftLaunch ?? true,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    listing: result.listing,
    walletTx: "walletTx" in result ? result.walletTx : undefined,
  });
}
