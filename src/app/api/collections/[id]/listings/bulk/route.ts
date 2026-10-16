import { getSessionUser } from "@/lib/auth/session";
import { readJsonBody } from "@/lib/http/json";
import { limitByUserOrIp } from "@/lib/http/rate-limit";
import { isNetworkId, resolveNetwork, vmFromNetwork } from "@/lib/chains/registry";
import type { ListingType, NetworkId } from "@/lib/discovery/types";
import {
  BULK_CHUNK_MAX,
  bulkCreateCollectionListings,
  type BulkItemResult,
} from "@/lib/marketplace/bulk-listings";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const traitSchema = z.object({
  trait_type: z.string().min(1).max(48),
  value: z.string().min(1).max(80),
});

const schema = z.object({
  shared: z.object({
    type: z.enum(["single", "collection", "open_edition", "auction"]),
    network: z.enum(["ethereum", "base", "arbitrum", "optimism", "solana", "boing"]),
    priceUsd: z.number().nonnegative().nullable().optional(),
    medium: z.string().min(1).max(64),
    styleTags: z.array(z.string().max(48)).max(24).default([]),
    oeStartsAt: z.string().nullable().optional(),
    oeEndsAt: z.string().nullable().optional(),
    auctionStartsAt: z.string().nullable().optional(),
    auctionEndsAt: z.string().nullable().optional(),
    saleMode: z.enum(["fixed", "timed_window", "english", "dutch"]).optional(),
    startingBidUsd: z.number().nonnegative().nullable().optional(),
    reserveUsd: z.number().nonnegative().nullable().optional(),
  }),
  items: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        description: z.string().max(2000).optional(),
        mediaHash: z.string().min(8).max(128),
        mediaUrl: z.string().max(2048).nullable().optional(),
        traits: z.array(traitSchema).max(24).optional(),
        maxSupply: z.number().int().positive().nullable().optional(),
        isCollectionHero: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(BULK_CHUNK_MAX),
});

/**
 * POST /api/collections/:id/listings/bulk — create up to 500 draft listings
 * per call (send 20 calls for a 10k collection). Idempotent per
 * (collection, mediaHash): resending a chunk returns `existing` rows.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await limitByUserOrIp(req, user.id, "listings-bulk", 120, 10 * 60_000);
  if (limited) return limited;

  const { id } = await params;
  const body = schema.safeParse(await readJsonBody(req));
  if (!body.success) {
    return NextResponse.json(
      { error: "invalid_body", details: body.error.flatten() },
      { status: 400 },
    );
  }
  const network = resolveNetwork(body.data.shared.network) as NetworkId;
  if (!isNetworkId(network)) {
    return NextResponse.json({ error: "invalid_network" }, { status: 400 });
  }

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    // Demo / fallback catalog: reuse the per-item path (no DB cost).
    const { createListingForUser } = await import("@/lib/marketplace/service");
    const s = body.data.shared;
    const results: BulkItemResult[] = [];
    for (const item of body.data.items) {
      const r = await createListingForUser({
        ...s,
        type: s.type as ListingType,
        network,
        chain: vmFromNetwork(network),
        creatorId: user.id,
        collectionId: id,
        title: item.title,
        description: item.description ?? "",
        mediaHash: item.mediaHash,
        mediaUrl: item.mediaUrl ?? undefined,
        traits: item.traits,
        maxSupply: item.maxSupply,
        isCollectionHero: item.isCollectionHero,
        publishSoftLaunch: false,
      });
      results.push(
        r.ok
          ? { mediaHash: item.mediaHash, status: "created", listingId: r.listing.id }
          : { mediaHash: item.mediaHash, status: "error", error: r.errors.join(",") },
      );
    }
    return NextResponse.json({ ok: true, results });
  }

  const result = await bulkCreateCollectionListings({
    creatorId: user.id,
    collectionId: id,
    shared: { ...body.data.shared, network },
    items: body.data.items,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}