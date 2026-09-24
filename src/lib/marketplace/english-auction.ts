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

export type EnglishOutcome =
  | { status: "not_english" }
  | { status: "upcoming" }
  | { status: "live" }
  | { status: "unsold"; reason: "no_winning_bid" | "reserve_not_met" }
  | {
      status: "award";
      amountUsd: number;
      highBidderId: string;
    };

/** Pure end-state for English auctions (unit-tested). */
export function evaluateEnglishOutcome(
  listing: AuctionListingSnap,
  now = Date.now(),
): EnglishOutcome {
  const mode = resolveSaleMode(listing);
  if (mode !== "english") return { status: "not_english" };
  const start = listing.auctionStartsAt;
  const end = listing.auctionEndsAt;
  if (start == null || end == null) {
    return { status: "unsold", reason: "no_winning_bid" };
  }
  if (now < start) return { status: "upcoming" };
  if (now <= end) return { status: "live" };

  const high = Number(listing.currentHighBidUsd ?? 0) || 0;
  if (high <= 0 || !listing.highBidderId) {
    return { status: "unsold", reason: "no_winning_bid" };
  }
  const reserve = Number(listing.reserveUsd ?? 0) || 0;
  if (reserve > 0 && high + 1e-9 < reserve) {
    return { status: "unsold", reason: "reserve_not_met" };
  }
  return {
    status: "award",
    amountUsd: high,
    highBidderId: listing.highBidderId,
  };
}

export type LazyEnglishSettleResult = {
  outcome: EnglishOutcome;
  purchaseId: string | null;
  purchaseStatus: string | null;
  created: boolean;
  /** open | claim_pending | awarded | unsold */
  settleLabel: "open" | "claim_pending" | "awarded" | "unsold";
};

async function loadAuctionListingSnap(
  listingId: string,
): Promise<
  | (AuctionListingSnap & { network?: string; chain?: string })
  | null
> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    const engine = getMemoryEngine();
    const l = engine.state.listings.get(listingId);
    if (!l) return null;
    return {
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
      network: l.network,
      chain: l.chain,
    };
  }
  const row = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!row) return null;
  return {
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
    network: row.network,
    chain: row.chain,
  };
}

async function markEnglishSoftOutcome(
  listingId: string,
  englishOutcome: "awarded" | "unsold",
) {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    const engine = getMemoryEngine();
    const live = engine.state.listings.get(listingId) as
      | (Record<string, unknown> & { id: string })
      | undefined;
    if (live) {
      live.englishOutcome = englishOutcome;
      engine.state.listings.set(listingId, live as never);
    }
  }
  // No schema column required: award is the pending/completed purchase;
  // unsold is derived from evaluateEnglishOutcome after end.
}

/**
 * Cron-less lazy settle: when an English listing is viewed / bid-listed after
 * end, create a pending_payment purchase for the high bidder at the winning
 * bid (wallet still required to pay), or mark unsold when reserve fails.
 */
export async function lazySettleEnglishAuction(
  listingId: string,
  now = Date.now(),
): Promise<LazyEnglishSettleResult> {
  const listing = await loadAuctionListingSnap(listingId);
  if (!listing) {
    return {
      outcome: { status: "not_english" },
      purchaseId: null,
      purchaseStatus: null,
      created: false,
      settleLabel: "open",
    };
  }

  const outcome = evaluateEnglishOutcome(listing, now);
  if (
    outcome.status === "not_english" ||
    outcome.status === "upcoming" ||
    outcome.status === "live"
  ) {
    return {
      outcome,
      purchaseId: null,
      purchaseStatus: null,
      created: false,
      settleLabel: "open",
    };
  }

  if (outcome.status === "unsold") {
    await markEnglishSoftOutcome(listingId, "unsold");
    return {
      outcome,
      purchaseId: null,
      purchaseStatus: null,
      created: false,
      settleLabel: "unsold",
    };
  }

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const {
    isMemoryMode,
    getMemoryPurchases,
    recordMemoryPurchase,
  } = await import("@/lib/data/memory-store");
  const { purchaseReservesSupply } = await import(
    "@/lib/marketplace/lifecycle"
  );
  const { splitSaleProceeds } = await import("@/lib/fees/platform");
  const mode = await ensureDatabaseReady();
  const fees = splitSaleProceeds(outcome.amountUsd);

  if (mode === "memory" || isMemoryMode()) {
    const existing = getMemoryPurchases().find(
      (p) =>
        p.listingId === listingId &&
        p.buyerId === outcome.highBidderId &&
        purchaseReservesSupply(p),
    );
    if (existing) {
      await markEnglishSoftOutcome(listingId, "awarded");
      return {
        outcome,
        purchaseId: existing.id,
        purchaseStatus: existing.status ?? null,
        created: false,
        settleLabel:
          existing.status === "completed" ? "awarded" : "claim_pending",
      };
    }
    const row = recordMemoryPurchase({
      listingId,
      buyerId: outcome.highBidderId,
      amountUsd: outcome.amountUsd,
      feeTotalUsd: fees.feeTotalUsd,
      feeTreasuryUsd: fees.feeTreasuryUsd,
      feeOperatorUsd: fees.feeOperatorUsd,
      sellerNetUsd: fees.sellerNetUsd,
      soldAt: now,
      status: "pending_payment",
      payNetwork: listing.network ?? null,
      paymentTxHash: null,
      txHash: `english-award:${listingId}:${now}`,
      chain: listing.chain ?? "evm",
    });
    await markEnglishSoftOutcome(listingId, "awarded");
    return {
      outcome,
      purchaseId: row.id,
      purchaseStatus: "pending_payment",
      created: true,
      settleLabel: "claim_pending",
    };
  }

  const existing = await prisma.purchase.findFirst({
    where: {
      listingId,
      buyerId: outcome.highBidderId,
      status: { in: ["pending_payment", "pending_transfer", "completed"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing && purchaseReservesSupply(existing)) {
    await markEnglishSoftOutcome(listingId, "awarded");
    return {
      outcome,
      purchaseId: existing.id,
      purchaseStatus: existing.status,
      created: false,
      settleLabel:
        existing.status === "completed" ? "awarded" : "claim_pending",
    };
  }

  const created = await prisma.purchase.create({
    data: {
      listingId,
      buyerId: outcome.highBidderId,
      amountUsd: outcome.amountUsd,
      feeTotalUsd: fees.feeTotalUsd,
      feeTreasuryUsd: fees.feeTreasuryUsd,
      feeOperatorUsd: fees.feeOperatorUsd,
      sellerNetUsd: fees.sellerNetUsd,
      status: "pending_payment",
      payNetwork: listing.network ?? null,
      txHash: `english-award:${listingId}:${now}`,
      chain: listing.chain ?? "evm",
    },
  });
  await markEnglishSoftOutcome(listingId, "awarded");
  return {
    outcome,
    purchaseId: created.id,
    purchaseStatus: created.status,
    created: true,
    settleLabel: "claim_pending",
  };
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
