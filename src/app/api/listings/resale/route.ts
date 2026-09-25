import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { canListResale } from "@/lib/marketplace/resale";
import { createListingForUser } from "@/lib/marketplace/service";
import { DEFAULT_CREATOR_RESALE_ROYALTY_BPS } from "@/lib/marketplace/trust";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  purchaseId: z.string().min(1),
  priceUsd: z.number().positive().max(1_000_000),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryPurchases, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();

  let purchase: {
    id: string;
    buyerId: string;
    listingId: string;
    status?: string | null;
  } | null = null;
  let origin: {
    id: string;
    title: string;
    description: string;
    creatorId: string;
    chain: string;
    network: string;
    medium: string;
    mediaHash: string;
    mediaUrl?: string | null;
    styleTags?: string[];
    contractAddress?: string | null;
    tokenId?: string | null;
    creatorRoyaltyBps?: number | null;
  } | null = null;
  let existingSecondary = false;

  if (mode === "memory" || isMemoryMode()) {
    const engine = getMemoryEngine();
    const p = getMemoryPurchases().find((x) => x.id === body.data.purchaseId);
    if (!p) return NextResponse.json({ error: "purchase_not_found" }, { status: 404 });
    purchase = p;
    const listing = engine.state.listings.get(p.listingId);
    if (!listing) {
      return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
    }
    origin = listing;
    existingSecondary = [...engine.state.listings.values()].some(
      (l) =>
        l.isSecondary &&
        l.originListingId === listing.id &&
        !l.delisted &&
        l.stage !== "draft",
    );
  } else {
    const p = await prisma.purchase.findUnique({
      where: { id: body.data.purchaseId },
      include: { listing: true },
    });
    if (!p) return NextResponse.json({ error: "purchase_not_found" }, { status: 404 });
    purchase = p;
    origin = {
      id: p.listing.id,
      title: p.listing.title,
      description: p.listing.description,
      creatorId: p.listing.creatorId,
      chain: p.listing.chain,
      network: p.listing.network,
      medium: p.listing.medium,
      mediaHash: p.listing.mediaHash,
      mediaUrl: p.listing.mediaUrl,
      styleTags: JSON.parse(p.listing.styleTagsJson || "[]"),
      contractAddress: p.listing.contractAddress,
      tokenId: p.listing.tokenId,
      creatorRoyaltyBps: p.listing.creatorRoyaltyBps,
    };
    const count = await prisma.listing.count({
      where: {
        isSecondary: true,
        originListingId: p.listingId,
        delisted: false,
        NOT: { stage: "draft" },
      },
    });
    existingSecondary = count > 0;
  }

  const gate = canListResale({
    actorId: user.id,
    purchase: purchase!,
    originListing: { id: origin!.id },
    existingSecondaryForOrigin: existingSecondary,
  });
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 400 });
  }

  const royalty =
    origin!.creatorRoyaltyBps ?? DEFAULT_CREATOR_RESALE_ROYALTY_BPS;

  const created = await createListingForUser({
    title: origin!.title,
    description: origin!.description || "Secondary listing",
    creatorId: origin!.creatorId,
    type: "single",
    chain: origin!.chain as "evm" | "solana" | "boing",
    network: origin!.network as
      | "ethereum"
      | "base"
      | "arbitrum"
      | "optimism"
      | "solana"
      | "boing",
    priceUsd: body.data.priceUsd,
    medium: origin!.medium,
    styleTags: origin!.styleTags ?? [],
    mediaHash: origin!.mediaHash,
    mediaUrl: origin!.mediaUrl ?? undefined,
    saleMode: "fixed",
    publishSoftLaunch: false,
  });

  if (!created.ok || !created.listing) {
    return NextResponse.json(
      { error: ("errors" in created && created.errors?.[0]) || "create_failed" },
      { status: 400 },
    );
  }

  // Stamp secondary + soft-launch without new-creator publish rate limits.
  const listingId = created.listing.id;
  const now = new Date();
  if (mode === "memory" || isMemoryMode()) {
    const engine = getMemoryEngine();
    const row = engine.state.listings.get(listingId);
    if (row) {
      engine.state.listings.set(listingId, {
        ...row,
        stage: "soft_launch",
        softLaunchedAt: Date.now(),
        isSecondary: true,
        sellerId: user.id,
        originListingId: origin!.id,
        creatorRoyaltyBps: royalty,
        contractAddress: origin!.contractAddress,
        tokenId: origin!.tokenId,
      });
    }
  } else {
    await prisma.listing.update({
      where: { id: listingId },
      data: {
        stage: "soft_launch",
        softLaunchedAt: now,
        isSecondary: true,
        sellerId: user.id,
        originListingId: origin!.id,
        creatorRoyaltyBps: royalty,
        contractAddress: origin!.contractAddress,
        tokenId: origin!.tokenId,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    listingId,
    href: `/listings/${listingId}`,
  });
}
