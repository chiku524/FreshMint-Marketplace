/**
 * Owner/seller manage helpers for per-NFT listing pages:
 * cancel (unlist), relist, and who may edit sale settings.
 */
import { prisma } from "@/lib/db";

export function listingSellerId(listing: {
  creatorId: string;
  sellerId?: string | null;
}): string {
  return listing.sellerId ?? listing.creatorId;
}

export function canManageListing(
  actorId: string | null | undefined,
  listing: { creatorId: string; sellerId?: string | null },
): boolean {
  if (!actorId) return false;
  return actorId === listing.creatorId || actorId === listingSellerId(listing);
}

/**
 * Minted on-chain with a real contract + tx — not drafts, simulations, or
 * mempool placeholders. Used for collection gallery visibility.
 */
export function listingIsOnChainMinted(listing: {
  tokenId?: string | null;
  contractAddress?: string | null;
  mintTxHash?: string | null;
}): boolean {
  const tokenId = listing.tokenId?.trim();
  const contract = listing.contractAddress?.trim();
  const tx = listing.mintTxHash?.trim();
  if (!tokenId || !contract || !tx) return false;
  if (contract.startsWith("pending:")) return false;
  const txLower = tx.toLowerCase();
  if (
    txLower.startsWith("simulated-mint:") ||
    txLower.startsWith("pending:") ||
    txLower === "ok" ||
    txLower === "0xok" ||
    txLower === "accepted" ||
    txLower === "success"
  ) {
    return false;
  }
  return true;
}

/** Minted or has artwork → stable public item page even when unlisted. */
export function listingHasPublicSurface(listing: {
  mediaUrl?: string | null;
  tokenId?: string | null;
  contractAddress?: string | null;
  mintTxHash?: string | null;
}): boolean {
  if (listingIsOnChainMinted(listing)) return true;
  return Boolean(listing.mediaUrl);
}

/**
 * Which collection artworks appear on `/collections/[idOrSlug]` Items grid.
 * Everyone (owner and buyer) only sees pieces that reached on-chain mint.
 * Unminted drafts stay off the gallery — owners manage them via Finish publishing.
 */
export function listingVisibleOnCollectionPage(
  listing: {
    stage?: string | null;
    delisted?: boolean;
    mediaUrl?: string | null;
    tokenId?: string | null;
    contractAddress?: string | null;
    mintTxHash?: string | null;
  },
  _isOwner: boolean,
): boolean {
  if (!listingIsOnChainMinted(listing)) return false;
  // Still-private drafts (even if mint fields were set) stay out of the gallery
  // until soft-launch / public stage.
  if (listing.stage === "draft") return false;
  return true;
}

async function cancelOpenOffersForListing(listingId: string): Promise<void> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    const { listOffersForListing, cancelOffer } = await import(
      "@/lib/marketplace/offers"
    );
    const offers = await listOffersForListing(listingId);
    for (const o of offers) {
      if (o.status === "open") {
        await cancelOffer({ offerId: o.id, actorId: o.offererId });
      }
    }
    return;
  }
  await prisma.offer.updateMany({
    where: { listingId, status: "open" },
    data: { status: "cancelled" },
  });
}

export async function cancelListingForSale(input: {
  listingId: string;
  actorId: string;
}): Promise<
  | { ok: true; listingId: string; delisted: true }
  | { ok: false; error: string }
> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );
  const { getDiscoveryEngine } = await import("@/lib/marketplace/service");
  const mode = await ensureDatabaseReady();
  const engine = await getDiscoveryEngine();
  const listing = engine.state.listings.get(input.listingId);
  if (!listing) return { ok: false, error: "not_found" };
  if (!canManageListing(input.actorId, listing)) {
    return { ok: false, error: "forbidden" };
  }
  if (listing.delisted) return { ok: false, error: "already_cancelled" };
  if (listing.currentHighBidUsd) {
    return { ok: false, error: "has_bids" };
  }

  await cancelOpenOffersForListing(input.listingId);

  if (mode === "memory" || isMemoryMode()) {
    const mem = getMemoryEngine();
    const live = mem.state.listings.get(input.listingId);
    if (!live) return { ok: false, error: "not_found" };
    live.delisted = true;
    mem.state.listings.set(input.listingId, live);
    return { ok: true, listingId: input.listingId, delisted: true };
  }

  await prisma.listing.update({
    where: { id: input.listingId },
    data: { delisted: true },
  });
  // Keep in-memory engine in sync for this request.
  listing.delisted = true;
  engine.state.listings.set(listing.id, listing);
  return { ok: true, listingId: input.listingId, delisted: true };
}

export async function relistListingForSale(input: {
  listingId: string;
  actorId: string;
  priceUsd?: number | null;
}): Promise<
  | { ok: true; listingId: string; delisted: false }
  | { ok: false; error: string }
> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );
  const { getDiscoveryEngine } = await import("@/lib/marketplace/service");
  const mode = await ensureDatabaseReady();
  const engine = await getDiscoveryEngine();
  const listing = engine.state.listings.get(input.listingId);
  if (!listing) return { ok: false, error: "not_found" };
  if (!canManageListing(input.actorId, listing)) {
    return { ok: false, error: "forbidden" };
  }
  if (!listing.delisted) return { ok: false, error: "not_cancelled" };

  const nextPrice =
    input.priceUsd !== undefined && input.priceUsd !== null
      ? input.priceUsd
      : listing.priceUsd;
  if (nextPrice == null || !(nextPrice > 0)) {
    return { ok: false, error: "price_required" };
  }

  if (mode === "memory" || isMemoryMode()) {
    const mem = getMemoryEngine();
    const live = mem.state.listings.get(input.listingId);
    if (!live) return { ok: false, error: "not_found" };
    live.delisted = false;
    live.priceUsd = nextPrice;
    if (live.stage === "draft") {
      live.stage = "soft_launch";
      live.softLaunchedAt = Date.now();
    }
    mem.state.listings.set(input.listingId, live);
    return { ok: true, listingId: input.listingId, delisted: false };
  }

  const data: {
    delisted: boolean;
    priceUsd: number;
    stage?: string;
    softLaunchedAt?: Date;
  } = {
    delisted: false,
    priceUsd: nextPrice,
  };
  if (listing.stage === "draft") {
    data.stage = "soft_launch";
    data.softLaunchedAt = new Date();
  }
  await prisma.listing.update({
    where: { id: input.listingId },
    data,
  });
  listing.delisted = false;
  listing.priceUsd = nextPrice;
  if (data.stage) {
    listing.stage = data.stage as typeof listing.stage;
    listing.softLaunchedAt = data.softLaunchedAt?.getTime() ?? Date.now();
  }
  engine.state.listings.set(listing.id, listing);
  return { ok: true, listingId: input.listingId, delisted: false };
}

/** Completed purchase by this buyer for the listing (primary collectible). */
export async function findBuyerCompletedPurchase(
  listingId: string,
  buyerId: string,
): Promise<{
  id: string;
  buyerId: string;
  listingId: string;
  amountUsd: number;
  status: string;
} | null> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryPurchases } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    const row = getMemoryPurchases().find(
      (p) =>
        p.listingId === listingId &&
        p.buyerId === buyerId &&
        (p.status ?? "completed") === "completed",
    );
    if (!row) return null;
    return {
      id: row.id,
      buyerId: row.buyerId,
      listingId: row.listingId,
      amountUsd: row.amountUsd,
      status: row.status ?? "completed",
    };
  }
  const row = await prisma.purchase.findFirst({
    where: { listingId, buyerId, status: "completed" },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  return {
    id: row.id,
    buyerId: row.buyerId,
    listingId: row.listingId,
    amountUsd: row.amountUsd,
    status: row.status ?? "completed",
  };
}

export async function hasActiveSecondaryForOrigin(
  originListingId: string,
): Promise<boolean> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    return [...getMemoryEngine().state.listings.values()].some(
      (l) =>
        l.isSecondary &&
        l.originListingId === originListingId &&
        !l.delisted &&
        l.stage !== "draft",
    );
  }
  const count = await prisma.listing.count({
    where: {
      isSecondary: true,
      originListingId,
      delisted: false,
      NOT: { stage: "draft" },
    },
  });
  return count > 0;
}
