import { prisma } from "@/lib/db";
import {
  ENGLISH_AWARD_TX_PREFIX,
  ENGLISH_WINNER_PAYMENT_DEADLINE_MS,
  englishAwardPaymentDeadlineAt,
  isEnglishAwardPurchase,
  purchaseReservesSupply,
} from "@/lib/marketplace/lifecycle";
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

export type BidCandidate = { bidderId: string; amountUsd: number };

/**
 * Next English awardee after a winner misses the payment deadline.
 * Uses each bidder's best bid; skips excluded ids; must meet reserve.
 */
export function pickNextEnglishAwardee(input: {
  bids: BidCandidate[];
  reserveUsd?: number | null;
  excludeBidderIds: string[];
}): { amountUsd: number; highBidderId: string } | null {
  const reserve = Number(input.reserveUsd ?? 0) || 0;
  const excluded = new Set(input.excludeBidderIds);
  const bestByBidder = new Map<string, number>();
  for (const b of input.bids) {
    if (!b.bidderId) continue;
    const amount = Number(b.amountUsd);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const prev = bestByBidder.get(b.bidderId) ?? 0;
    if (amount > prev) bestByBidder.set(b.bidderId, amount);
  }
  const ranked = [...bestByBidder.entries()]
    .map(([highBidderId, amountUsd]) => ({ highBidderId, amountUsd }))
    .filter((row) => !excluded.has(row.highBidderId))
    .filter((row) => reserve <= 0 || row.amountUsd + 1e-9 >= reserve)
    .sort((a, b) => b.amountUsd - a.amountUsd || a.highBidderId.localeCompare(b.highBidderId));
  return ranked[0] ?? null;
}

export function englishPaymentDeadlineFromAwardAt(awardedAtMs: number): number {
  return awardedAtMs + ENGLISH_WINNER_PAYMENT_DEADLINE_MS;
}

export type LazyEnglishSettleResult = {
  outcome: EnglishOutcome;
  purchaseId: string | null;
  purchaseStatus: string | null;
  created: boolean;
  /** open | claim_pending | awarded | unsold | awaiting_payment | cascaded | payment_expired_unsold */
  settleLabel:
    | "open"
    | "claim_pending"
    | "awarded"
    | "unsold"
    | "awaiting_payment"
    | "cascaded"
    | "payment_expired_unsold";
  paymentDeadlineAt: number | null;
  cascaded: boolean;
  expiredWinnerId: string | null;
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
 * Winner payment deadline is 48h (derived from english-award txHash + createdAt).
 * On expiry, cancel the stale purchase and cascade to the next reserve-meeting
 * bidder, or mark unsold.
 */
export async function lazySettleEnglishAuction(
  listingId: string,
  now = Date.now(),
): Promise<LazyEnglishSettleResult> {
  const empty = (
    outcome: EnglishOutcome,
    settleLabel: LazyEnglishSettleResult["settleLabel"],
    extra?: Partial<LazyEnglishSettleResult>,
  ): LazyEnglishSettleResult => ({
    outcome,
    purchaseId: null,
    purchaseStatus: null,
    created: false,
    settleLabel,
    paymentDeadlineAt: null,
    cascaded: false,
    expiredWinnerId: null,
    ...extra,
  });

  const listing = await loadAuctionListingSnap(listingId);
  if (!listing) {
    return empty({ status: "not_english" }, "open");
  }
  const listingNetwork = listing.network ?? null;
  const listingChain = listing.chain ?? "evm";

  const outcome = evaluateEnglishOutcome(listing, now);
  if (
    outcome.status === "not_english" ||
    outcome.status === "upcoming" ||
    outcome.status === "live"
  ) {
    return empty(outcome, "open");
  }

  if (outcome.status === "unsold") {
    await markEnglishSoftOutcome(listingId, "unsold");
    return empty(outcome, "unsold");
  }

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const {
    isMemoryMode,
    getMemoryPurchases,
    recordMemoryPurchase,
    updateMemoryPurchase,
    getMemoryEngine,
  } = await import("@/lib/data/memory-store");
  const { splitSaleProceeds } = await import("@/lib/fees/platform");
  const mode = await ensureDatabaseReady();
  const memory = mode === "memory" || isMemoryMode();

  async function loadEnglishAwardPurchases(): Promise<
    Array<{
      id: string;
      buyerId: string;
      status: string | null | undefined;
      amountUsd: number;
      soldAt?: number | null;
      createdAt?: Date | number | null;
      txHash?: string | null;
    }>
  > {
    if (memory) {
      return getMemoryPurchases()
        .filter(
          (p) =>
            p.listingId === listingId && isEnglishAwardPurchase(p),
        )
        .map((p) => ({
          id: p.id,
          buyerId: p.buyerId,
          status: p.status ?? null,
          amountUsd: p.amountUsd,
          soldAt: p.soldAt,
          txHash: p.txHash,
        }));
    }
    const rows = await prisma.purchase.findMany({
      where: {
        listingId,
        txHash: { startsWith: ENGLISH_AWARD_TX_PREFIX },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      buyerId: r.buyerId,
      status: r.status,
      amountUsd: r.amountUsd,
      createdAt: r.createdAt,
      txHash: r.txHash,
    }));
  }

  async function cancelEnglishAward(purchaseId: string) {
    if (memory) {
      updateMemoryPurchase(purchaseId, { status: "failed" });
      return;
    }
    await prisma.purchase.update({
      where: { id: purchaseId },
      data: { status: "failed" },
    });
  }

  async function setListingHigh(
    highBidderId: string,
    currentHighBidUsd: number,
  ) {
    if (memory) {
      const engine = getMemoryEngine();
      const live = engine.state.listings.get(listingId) as
        | (Record<string, unknown> & { id: string })
        | undefined;
      if (live) {
        live.highBidderId = highBidderId;
        live.currentHighBidUsd = currentHighBidUsd;
        engine.state.listings.set(listingId, live as never);
      }
      return;
    }
    await prisma.listing.update({
      where: { id: listingId },
      data: { highBidderId, currentHighBidUsd },
    });
  }

  async function createAwardPurchase(input: {
    buyerId: string;
    amountUsd: number;
  }) {
    const fees = splitSaleProceeds(input.amountUsd);
    if (memory) {
      return recordMemoryPurchase({
        listingId,
        buyerId: input.buyerId,
        amountUsd: input.amountUsd,
        feeTotalUsd: fees.feeTotalUsd,
        feeTreasuryUsd: fees.feeTreasuryUsd,
        feeOperatorUsd: fees.feeOperatorUsd,
        sellerNetUsd: fees.sellerNetUsd,
        soldAt: now,
        status: "pending_payment",
        payNetwork: listingNetwork,
        paymentTxHash: null,
        txHash: `${ENGLISH_AWARD_TX_PREFIX}${listingId}:${now}`,
        chain: listingChain,
      });
    }
    return prisma.purchase.create({
      data: {
        listingId,
        buyerId: input.buyerId,
        amountUsd: input.amountUsd,
        feeTotalUsd: fees.feeTotalUsd,
        feeTreasuryUsd: fees.feeTreasuryUsd,
        feeOperatorUsd: fees.feeOperatorUsd,
        sellerNetUsd: fees.sellerNetUsd,
        status: "pending_payment",
        payNetwork: listingNetwork,
        txHash: `${ENGLISH_AWARD_TX_PREFIX}${listingId}:${now}`,
        chain: listingChain,
      },
    });
  }

  const awards = await loadEnglishAwardPurchases();
  const openOrDone = awards.find(
    (p) =>
      (p.status === "pending_payment" ||
        p.status === "pending_transfer" ||
        p.status === "completed") &&
      purchaseReservesSupply(p, now),
  );

  if (openOrDone) {
    await markEnglishSoftOutcome(listingId, "awarded");
    const deadline = englishAwardPaymentDeadlineAt(openOrDone);
    const priorFailed = awards.some((p) => p.status === "failed");
    const label =
      openOrDone.status === "completed"
        ? "awarded"
        : openOrDone.status === "pending_transfer"
          ? "claim_pending"
          : priorFailed
            ? "cascaded"
            : "awaiting_payment";
    return {
      outcome: {
        status: "award",
        amountUsd: openOrDone.amountUsd,
        highBidderId: openOrDone.buyerId,
      },
      purchaseId: openOrDone.id,
      purchaseStatus: openOrDone.status ?? null,
      created: false,
      settleLabel: label,
      paymentDeadlineAt:
        openOrDone.status === "pending_payment" ? deadline : null,
      cascaded: priorFailed,
      expiredWinnerId: priorFailed
        ? awards.find((p) => p.status === "failed")?.buyerId ?? null
        : null,
    };
  }

  // Expire any stale english pending_payment awards that no longer reserve supply.
  const expiredPending = awards.filter(
    (p) =>
      p.status === "pending_payment" &&
      isEnglishAwardPurchase(p) &&
      !purchaseReservesSupply(p, now),
  );
  let expiredWinnerId: string | null = null;
  for (const stale of expiredPending) {
    await cancelEnglishAward(stale.id);
    expiredWinnerId = stale.buyerId;
  }

  const failedAwardBuyerIds = awards
    .filter((p) => p.status === "failed" || expiredPending.some((e) => e.id === p.id))
    .map((p) => p.buyerId);
  // Also exclude anyone whose award just expired this pass.
  const exclude = [
    ...new Set([
      ...failedAwardBuyerIds,
      ...expiredPending.map((p) => p.buyerId),
    ]),
  ];

  // If current high bidder's award expired, try cascade; otherwise first award.
  const needsCascade = expiredPending.length > 0;
  let awardTarget: { highBidderId: string; amountUsd: number } | null = null;
  let cascaded = false;

  if (needsCascade) {
    const bids = await listBidsForListing(listingId, 200);
    const next = pickNextEnglishAwardee({
      bids,
      reserveUsd: listing.reserveUsd,
      excludeBidderIds: exclude,
    });
    if (!next) {
      await markEnglishSoftOutcome(listingId, "unsold");
      return empty(
        { status: "unsold", reason: "no_winning_bid" },
        "payment_expired_unsold",
        { expiredWinnerId, cascaded: false },
      );
    }
    awardTarget = next;
    cascaded = true;
    await setListingHigh(next.highBidderId, next.amountUsd);
  } else {
    // No open award yet — create for current high bidder from outcome.
    awardTarget = {
      highBidderId: outcome.highBidderId,
      amountUsd: outcome.amountUsd,
    };
  }

  const created = await createAwardPurchase({
    buyerId: awardTarget.highBidderId,
    amountUsd: awardTarget.amountUsd,
  });
  await markEnglishSoftOutcome(listingId, "awarded");
  const createdAt =
    "createdAt" in created && created.createdAt instanceof Date
      ? created.createdAt.getTime()
      : typeof (created as { soldAt?: number }).soldAt === "number"
        ? (created as { soldAt: number }).soldAt
        : now;
  const deadline = createdAt + ENGLISH_WINNER_PAYMENT_DEADLINE_MS;

  return {
    outcome: {
      status: "award",
      amountUsd: awardTarget.amountUsd,
      highBidderId: awardTarget.highBidderId,
    },
    purchaseId: created.id,
    purchaseStatus: "pending_payment",
    created: true,
    settleLabel: cascaded ? "cascaded" : "awaiting_payment",
    paymentDeadlineAt: deadline,
    cascaded,
    expiredWinnerId,
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
