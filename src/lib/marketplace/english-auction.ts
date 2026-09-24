import { prisma } from "@/lib/db";
import {
  minNextBidUsd,
  parseSaleMode,
  resolveSaleMode,
  type SaleMode,
} from "@/lib/marketplace/sale-mode";

export type BidRow = {
  id: string;
  listingId: string;
  bidderId: string;
  amountUsd: number;
  createdAt: number;
};

export type PlaceBidInput = {
  listingId: string;
  bidderId: string;
  amountUsd: number;
  now?: number;
};

export type PlaceBidResult =
  | { ok: true; bid: BidRow; currentHighBidUsd: number; highBidderId: string }
  | { ok: false; error: string };

export type AuctionListingSnap = {
  id: string;
  creatorId: string;
  type: string;
  saleMode?: string | null;
  delisted: boolean;
  priceUsd: number | null;
  startingBidUsd?: number | null;
  reserveUsd?: number | null;
  currentHighBidUsd?: number | null;
  highBidderId?: string | null;
  auctionStartsAt: number | null;
  auctionEndsAt: number | null;
};

/** Pure bid-rule check (unit-tested). */
export function evaluateBidRules(input: {
  listing: AuctionListingSnap;
  bidderId: string;
  amountUsd: number;
  now?: number;
}): { ok: true; minBid: number } | { ok: false; error: string } {
  const now = input.now ?? Date.now();
  const mode = resolveSaleMode(input.listing);
  if (mode !== "english") return { ok: false, error: "not_english_auction" };
  if (input.listing.delisted) return { ok: false, error: "unavailable" };
  if (input.bidderId === input.listing.creatorId) {
    return { ok: false, error: "cannot_bid_own_listing" };
  }
  const start = input.listing.auctionStartsAt;
  const end = input.listing.auctionEndsAt;
  if (start == null || end == null) {
    return { ok: false, error: "auction_window_required" };
  }
  if (now < start) return { ok: false, error: "auction_not_started" };
  if (now > end) return { ok: false, error: "auction_ended" };

  const amount = Number(input.amountUsd);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "invalid_amount" };
  }
  const minBid = minNextBidUsd({
    startingBidUsd: input.listing.startingBidUsd,
    priceUsd: input.listing.priceUsd,
    currentHighBidUsd: input.listing.currentHighBidUsd,
  });
  if (amount + 1e-9 < minBid) {
    return { ok: false, error: "bid_too_low" };
  }
  return { ok: true, minBid };
}

export function englishSettlement(input: {
  listing: AuctionListingSnap;
  buyerId: string;
  now?: number;
}): { ok: true; amountUsd: number } | { ok: false; error: string } {
  const now = input.now ?? Date.now();
  const mode = resolveSaleMode(input.listing);
  if (mode !== "english") return { ok: false, error: "not_english_auction" };
  const end = input.listing.auctionEndsAt;
  if (end == null || now <= end) {
    return { ok: false, error: "auction_still_open" };
  }
  const high = Number(input.listing.currentHighBidUsd ?? 0) || 0;
  if (high <= 0 || !input.listing.highBidderId) {
    return { ok: false, error: "no_winning_bid" };
  }
  const reserve = Number(input.listing.reserveUsd ?? 0) || 0;
  if (reserve > 0 && high + 1e-9 < reserve) {
    return { ok: false, error: "reserve_not_met" };
  }
  if (input.buyerId !== input.listing.highBidderId) {
    return { ok: false, error: "not_high_bidder" };
  }
  return { ok: true, amountUsd: high };
}

const memoryBids: BidRow[] = [];

export function __resetMemoryBidsForTests() {
  memoryBids.length = 0;
}

export function getMemoryBids(listingId?: string): BidRow[] {
  const rows = listingId
    ? memoryBids.filter((b) => b.listingId === listingId)
    : [...memoryBids];
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export async function listBidsForListing(
  listingId: string,
  limit = 40,
): Promise<BidRow[]> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    return getMemoryBids(listingId).slice(0, limit);
  }
  const rows = await prisma.bid.findMany({
    where: { listingId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    listingId: r.listingId,
    bidderId: r.bidderId,
    amountUsd: r.amountUsd,
    createdAt: r.createdAt.getTime(),
  }));
}

export async function placeBid(input: PlaceBidInput): Promise<PlaceBidResult> {
  const now = input.now ?? Date.now();
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();

  let listing: AuctionListingSnap | null = null;

  if (mode === "memory" || isMemoryMode()) {
    const engine = getMemoryEngine();
    const l = engine.state.listings.get(input.listingId);
    if (!l) return { ok: false, error: "not_found" };
    listing = {
      id: l.id,
      creatorId: l.creatorId,
      type: l.type,
      saleMode: (l as { saleMode?: string | null }).saleMode,
      delisted: l.delisted,
      priceUsd: l.priceUsd,
      startingBidUsd: (l as { startingBidUsd?: number | null }).startingBidUsd,
      reserveUsd: (l as { reserveUsd?: number | null }).reserveUsd,
      currentHighBidUsd: (l as { currentHighBidUsd?: number | null })
        .currentHighBidUsd,
      highBidderId: (l as { highBidderId?: string | null }).highBidderId,
      auctionStartsAt: l.auctionStartsAt,
      auctionEndsAt: l.auctionEndsAt,
    };
  } else {
    const row = await prisma.listing.findUnique({
      where: { id: input.listingId },
    });
    if (!row) return { ok: false, error: "not_found" };
    listing = {
      id: row.id,
      creatorId: row.creatorId,
      type: row.type,
      saleMode: row.saleMode,
      delisted: row.delisted,
      priceUsd: row.priceUsd,
      startingBidUsd: row.startingBidUsd,
      reserveUsd: row.reserveUsd,
      currentHighBidUsd: row.currentHighBidUsd,
      highBidderId: row.highBidderId,
      auctionStartsAt: row.auctionStartsAt?.getTime() ?? null,
      auctionEndsAt: row.auctionEndsAt?.getTime() ?? null,
    };
  }

  const rules = evaluateBidRules({
    listing,
    bidderId: input.bidderId,
    amountUsd: input.amountUsd,
    now,
  });
  if (!rules.ok) return rules;

  const amountUsd = Math.round(Number(input.amountUsd) * 100) / 100;

  if (mode === "memory" || isMemoryMode()) {
    const bid: BidRow = {
      id: `bid-mem-${now}-${memoryBids.length}`,
      listingId: listing.id,
      bidderId: input.bidderId,
      amountUsd,
      createdAt: now,
    };
    memoryBids.unshift(bid);
    const engine = getMemoryEngine();
    const live = engine.state.listings.get(listing.id) as
      | (Record<string, unknown> & { id: string })
      | undefined;
    if (live) {
      live.currentHighBidUsd = amountUsd;
      live.highBidderId = input.bidderId;
      live.saleMode = "english";
      engine.state.listings.set(listing.id, live as never);
    }
    return {
      ok: true,
      bid,
      currentHighBidUsd: amountUsd,
      highBidderId: input.bidderId,
    };
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const fresh = await tx.listing.findUnique({ where: { id: listing!.id } });
      if (!fresh) throw new Error("not_found");
      const freshListing: AuctionListingSnap = {
        id: fresh.id,
        creatorId: fresh.creatorId,
        type: fresh.type,
        saleMode: fresh.saleMode,
        delisted: fresh.delisted,
        priceUsd: fresh.priceUsd,
        startingBidUsd: fresh.startingBidUsd,
        reserveUsd: fresh.reserveUsd,
        currentHighBidUsd: fresh.currentHighBidUsd,
        highBidderId: fresh.highBidderId,
        auctionStartsAt: fresh.auctionStartsAt?.getTime() ?? null,
        auctionEndsAt: fresh.auctionEndsAt?.getTime() ?? null,
      };
      const again = evaluateBidRules({
        listing: freshListing,
        bidderId: input.bidderId,
        amountUsd,
        now,
      });
      if (!again.ok) throw new Error(again.error);
      const bid = await tx.bid.create({
        data: {
          listingId: listing!.id,
          bidderId: input.bidderId,
          amountUsd,
        },
      });
      await tx.listing.update({
        where: { id: listing!.id },
        data: {
          currentHighBidUsd: amountUsd,
          highBidderId: input.bidderId,
          saleMode: "english",
        },
      });
      return bid;
    });

    return {
      ok: true,
      bid: {
        id: created.id,
        listingId: created.listingId,
        bidderId: created.bidderId,
        amountUsd: created.amountUsd,
        createdAt: created.createdAt.getTime(),
      },
      currentHighBidUsd: amountUsd,
      highBidderId: input.bidderId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "bid_failed";
    return { ok: false, error: msg };
  }
}

export function assertSaleMode(value: string): SaleMode {
  return parseSaleMode(value);
}
