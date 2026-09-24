/**
 * Batch English lazy-settle for cron + on-demand use.
 */
import { prisma } from "@/lib/db";
import { lazySettleEnglishAuction } from "@/lib/marketplace/english-auction";
import { resolveSaleMode } from "@/lib/marketplace/sale-mode";
import {
  ENGLISH_AWARD_TX_PREFIX,
  ENGLISH_WINNER_PAYMENT_DEADLINE_MS,
} from "@/lib/marketplace/lifecycle";

export type SettleAuctionsBatchResult = {
  scanned: number;
  settled: number;
  awarded: number;
  unsold: number;
  cascaded: number;
  errors: Array<{ listingId: string; error: string }>;
};

export async function settleEndedEnglishAuctions(input?: {
  now?: number;
  limit?: number;
}): Promise<SettleAuctionsBatchResult> {
  const now = input?.now ?? Date.now();
  const limit = Math.min(Math.max(input?.limit ?? 50, 1), 200);
  const result: SettleAuctionsBatchResult = {
    scanned: 0,
    settled: 0,
    awarded: 0,
    unsold: 0,
    cascaded: 0,
    errors: [],
  };

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();

  const listingIds: string[] = [];

  if (mode === "memory" || isMemoryMode()) {
    const engine = getMemoryEngine();
    for (const listing of engine.state.listings.values()) {
      if (resolveSaleMode(listing) !== "english") continue;
      if (listing.delisted) continue;
      if (listing.auctionEndsAt == null || listing.auctionEndsAt >= now) continue;
      listingIds.push(listing.id);
      if (listingIds.length >= limit) break;
    }
  } else {
    // Ended english listings
    const ended = await prisma.listing.findMany({
      where: {
        delisted: false,
        saleMode: "english",
        auctionEndsAt: { lte: new Date(now) },
      },
      select: { id: true },
      take: limit,
      orderBy: { auctionEndsAt: "asc" },
    });
    listingIds.push(...ended.map((l) => l.id));

    // Also pick up listings with expired english-award pending payments
    // (in case saleMode drifted or endsAt null edge cases)
    if (listingIds.length < limit) {
      const cutoff = new Date(now - ENGLISH_WINNER_PAYMENT_DEADLINE_MS);
      const expiredAwards = await prisma.purchase.findMany({
        where: {
          status: "pending_payment",
          txHash: { startsWith: ENGLISH_AWARD_TX_PREFIX },
          createdAt: { lte: cutoff },
        },
        select: { listingId: true },
        take: limit,
        distinct: ["listingId"],
      });
      for (const row of expiredAwards) {
        if (!listingIds.includes(row.listingId)) listingIds.push(row.listingId);
        if (listingIds.length >= limit) break;
      }
    }
  }

  result.scanned = listingIds.length;
  for (const listingId of listingIds) {
    try {
      const settle = await lazySettleEnglishAuction(listingId, now);
      result.settled += 1;
      if (
        settle.settleLabel === "unsold" ||
        settle.settleLabel === "payment_expired_unsold"
      ) {
        result.unsold += 1;
      } else if (settle.cascaded || settle.settleLabel === "cascaded") {
        result.cascaded += 1;
      } else if (
        settle.settleLabel === "awaiting_payment" ||
        settle.settleLabel === "claim_pending" ||
        settle.settleLabel === "awarded"
      ) {
        result.awarded += 1;
      }
    } catch (err) {
      result.errors.push({
        listingId,
        error: err instanceof Error ? err.message : "settle_failed",
      });
    }
  }

  return result;
}

export function assertCronAuthorized(req: {
  headers: { get(name: string): string | null };
}): { ok: true } | { ok: false; error: string; status: number } {
  const secret = process.env.CRON_SECRET;
  if (!secret || !secret.trim()) {
    return { ok: false, error: "cron_secret_not_configured", status: 503 };
  }
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (auth !== expected) {
    return { ok: false, error: "unauthorized", status: 401 };
  }
  return { ok: true };
}
