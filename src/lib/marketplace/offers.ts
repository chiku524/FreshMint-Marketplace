import { prisma } from "@/lib/db";
import { splitSaleProceeds } from "@/lib/fees/platform";
import { resolveSaleMode } from "@/lib/marketplace/sale-mode";

export const OFFER_ACCEPT_TX_PREFIX = "offer-accept:";

export type OfferRow = {
  id: string;
  listingId: string;
  offererId: string;
  amountUsd: number;
  status: "open" | "accepted" | "cancelled" | "expired";
  createdAt: number;
};

type MemoryOffer = OfferRow;

const memoryOffers: MemoryOffer[] = [];

export function __resetMemoryOffersForTests() {
  memoryOffers.length = 0;
}

/** Snapshot for Friday raffle eligibility (memory mode). */
export function listMemoryOffersForRaffle(): OfferRow[] {
  return [...memoryOffers];
}

function roundUsd(n: number) {
  return Math.round(n * 100) / 100;
}

async function listingSnap(listingId: string) {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    const l = getMemoryEngine().state.listings.get(listingId);
    if (!l) return null;
    return {
      id: l.id,
      creatorId: l.creatorId,
      sellerId: (l as { sellerId?: string | null }).sellerId ?? l.creatorId,
      type: l.type,
      saleMode: (l as { saleMode?: string | null }).saleMode,
      delisted: l.delisted,
      priceUsd: l.priceUsd,
      chain: l.chain,
      network: l.network,
      tokenId: l.tokenId,
      contractAddress: l.contractAddress,
      mintTxHash: l.mintTxHash,
      stage: l.stage,
    };
  }
  const row = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!row) return null;
  return {
    id: row.id,
    creatorId: row.creatorId,
    sellerId: row.sellerId ?? row.creatorId,
    type: row.type,
    saleMode: row.saleMode,
    delisted: row.delisted,
    priceUsd: row.priceUsd,
    chain: row.chain,
    network: row.network,
    tokenId: row.tokenId,
    contractAddress: row.contractAddress,
    mintTxHash: row.mintTxHash,
    stage: row.stage,
  };
}

function offersAllowed(listing: {
  delisted: boolean;
  stage: string;
  saleMode?: string | null;
  type: string;
  tokenId?: string | null;
  contractAddress?: string | null;
  mintTxHash?: string | null;
}) {
  if (listing.delisted || listing.stage === "draft") return false;
  if (!listing.tokenId || !listing.contractAddress || !listing.mintTxHash) {
    return false;
  }
  const mode = resolveSaleMode(listing);
  // Offers on Buy now / timed listing — not during live bidding auctions.
  return mode === "fixed" || mode === "timed_window";
}

export async function listOffersForListing(
  listingId: string,
  limit = 40,
): Promise<OfferRow[]> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    return memoryOffers
      .filter((o) => o.listingId === listingId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }
  const rows = await prisma.offer.findMany({
    where: { listingId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    listingId: r.listingId,
    offererId: r.offererId,
    amountUsd: r.amountUsd,
    status: r.status as OfferRow["status"],
    createdAt: r.createdAt.getTime(),
  }));
}

export async function makeOffer(input: {
  listingId: string;
  offererId: string;
  amountUsd: number;
}): Promise<{ ok: true; offer: OfferRow } | { ok: false; error: string }> {
  const amountUsd = roundUsd(Number(input.amountUsd));
  if (!(amountUsd > 0)) return { ok: false, error: "invalid_amount" };

  const listing = await listingSnap(input.listingId);
  if (!listing) return { ok: false, error: "not_found" };
  if (!offersAllowed(listing)) return { ok: false, error: "offers_disabled" };
  if (
    input.offererId === listing.creatorId ||
    input.offererId === listing.sellerId
  ) {
    return { ok: false, error: "cannot_offer_own" };
  }

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  const now = Date.now();

  if (mode === "memory" || isMemoryMode()) {
    const offer: OfferRow = {
      id: `offer-mem-${now}-${memoryOffers.length}`,
      listingId: listing.id,
      offererId: input.offererId,
      amountUsd,
      status: "open",
      createdAt: now,
    };
    memoryOffers.unshift(offer);
    return { ok: true, offer };
  }

  const created = await prisma.offer.create({
    data: {
      listingId: listing.id,
      offererId: input.offererId,
      amountUsd,
      status: "open",
    },
  });
  return {
    ok: true,
    offer: {
      id: created.id,
      listingId: created.listingId,
      offererId: created.offererId,
      amountUsd: created.amountUsd,
      status: "open",
      createdAt: created.createdAt.getTime(),
    },
  };
}

export async function cancelOffer(input: {
  offerId: string;
  actorId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();

  if (mode === "memory" || isMemoryMode()) {
    const offer = memoryOffers.find((o) => o.id === input.offerId);
    if (!offer) return { ok: false, error: "not_found" };
    if (offer.offererId !== input.actorId) return { ok: false, error: "forbidden" };
    if (offer.status !== "open") return { ok: false, error: "not_open" };
    offer.status = "cancelled";
    return { ok: true };
  }

  const row = await prisma.offer.findUnique({ where: { id: input.offerId } });
  if (!row) return { ok: false, error: "not_found" };
  if (row.offererId !== input.actorId) return { ok: false, error: "forbidden" };
  if (row.status !== "open") return { ok: false, error: "not_open" };
  await prisma.offer.update({
    where: { id: row.id },
    data: { status: "cancelled" },
  });
  return { ok: true };
}

/**
 * Seller accepts an open offer → pending_payment purchase for the offerer.
 * Other open offers on the listing are cancelled.
 */
export async function acceptOffer(input: {
  offerId: string;
  actorId: string;
}): Promise<
  | { ok: true; purchaseId: string; amountUsd: number; offererId: string }
  | { ok: false; error: string }
> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, recordMemoryPurchase } = await import(
    "@/lib/data/memory-store"
  );

  const mode = await ensureDatabaseReady();
  const now = Date.now();

  let offer: OfferRow | null = null;
  if (mode === "memory" || isMemoryMode()) {
    offer = memoryOffers.find((o) => o.id === input.offerId) ?? null;
  } else {
    const row = await prisma.offer.findUnique({ where: { id: input.offerId } });
    if (row) {
      offer = {
        id: row.id,
        listingId: row.listingId,
        offererId: row.offererId,
        amountUsd: row.amountUsd,
        status: row.status as OfferRow["status"],
        createdAt: row.createdAt.getTime(),
      };
    }
  }
  if (!offer) return { ok: false, error: "not_found" };
  if (offer.status !== "open") return { ok: false, error: "not_open" };

  const listing = await listingSnap(offer.listingId);
  if (!listing) return { ok: false, error: "not_found" };
  const sellerId = listing.sellerId ?? listing.creatorId;
  if (input.actorId !== sellerId && input.actorId !== listing.creatorId) {
    return { ok: false, error: "forbidden" };
  }
  if (!offersAllowed(listing)) return { ok: false, error: "offers_disabled" };

  const fees = splitSaleProceeds(offer.amountUsd);
  const txHash = `${OFFER_ACCEPT_TX_PREFIX}${offer.id}:${now}`;

  if (mode === "memory" || isMemoryMode()) {
    for (const o of memoryOffers) {
      if (o.listingId === listing.id && o.status === "open") {
        o.status = o.id === offer.id ? "accepted" : "cancelled";
      }
    }
    const p = recordMemoryPurchase({
      listingId: listing.id,
      buyerId: offer.offererId,
      amountUsd: offer.amountUsd,
      feeTotalUsd: fees.feeTotalUsd,
      feeTreasuryUsd: fees.feeTreasuryUsd,
      feeOperatorUsd: fees.feeOperatorUsd,
      sellerNetUsd: fees.sellerNetUsd,
      soldAt: now,
      status: "pending_payment",
      payNetwork: listing.network,
      paymentTxHash: null,
      txHash,
      chain: listing.chain,
    });
    return {
      ok: true,
      purchaseId: p.id,
      amountUsd: offer.amountUsd,
      offererId: offer.offererId,
    };
  }

  const purchase = await prisma.$transaction(async (tx) => {
    const fresh = await tx.offer.findUnique({ where: { id: offer!.id } });
    if (!fresh || fresh.status !== "open") throw new Error("not_open");
    await tx.offer.update({
      where: { id: fresh.id },
      data: { status: "accepted" },
    });
    await tx.offer.updateMany({
      where: {
        listingId: listing.id,
        status: "open",
        id: { not: fresh.id },
      },
      data: { status: "cancelled" },
    });
    return tx.purchase.create({
      data: {
        listingId: listing.id,
        buyerId: fresh.offererId,
        amountUsd: fresh.amountUsd,
        feeTotalUsd: fees.feeTotalUsd,
        feeTreasuryUsd: fees.feeTreasuryUsd,
        feeOperatorUsd: fees.feeOperatorUsd,
        sellerNetUsd: fees.sellerNetUsd,
        status: "pending_payment",
        payNetwork: listing.network,
        txHash,
        chain: listing.chain,
      },
    });
  });

  return {
    ok: true,
    purchaseId: purchase.id,
    amountUsd: offer.amountUsd,
    offererId: offer.offererId,
  };
}
