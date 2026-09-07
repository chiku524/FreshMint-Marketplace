import { prisma } from "@/lib/db";
import type { ListingType } from "@/lib/discovery/types";
import { primarySupplyCap } from "@/lib/marketplace/drops";
import {
  purchaseReservesSupply,
} from "@/lib/marketplace/lifecycle";

export {
  PENDING_PAYMENT_TTL_MS,
  purchaseReservesSupply,
} from "@/lib/marketplace/lifecycle";

/** Open editions (or any listing with maxSupply > 1) can sell more than once. */
export function allowsRepeatPrimaryPurchase(
  listing: { type: ListingType | string; maxSupply?: number | null },
): boolean {
  const cap = primarySupplyCap(listing);
  return cap == null || cap > 1;
}

export async function expireStalePendingPurchases(now = Date.now()): Promise<number> {
  const { PENDING_PAYMENT_TTL_MS } = await import("@/lib/marketplace/lifecycle");
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryPurchases, updateMemoryPurchase } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();
  const cutoff = now - PENDING_PAYMENT_TTL_MS;
  let expired = 0;

  if (mode === "memory" || isMemoryMode()) {
    for (const purchase of getMemoryPurchases()) {
      if (
        purchase.status === "pending_payment" &&
        (purchase.soldAt ?? 0) < cutoff
      ) {
        updateMemoryPurchase(purchase.id, { status: "failed" });
        expired += 1;
      }
    }
    return expired;
  }

  const result = await prisma.purchase.updateMany({
    where: {
      status: "pending_payment",
      createdAt: { lt: new Date(cutoff) },
    },
    data: { status: "failed" },
  });
  return result.count;
}

export async function countReservingPurchases(listingId: string): Promise<number> {
  await expireStalePendingPurchases();
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryPurchases } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    return getMemoryPurchases().filter(
      (p) => p.listingId === listingId && purchaseReservesSupply(p),
    ).length;
  }
  const rows = await prisma.purchase.findMany({
    where: {
      listingId,
      status: { in: ["completed", "pending_transfer", "pending_payment"] },
    },
    select: { status: true, createdAt: true },
  });
  return rows.filter((p) => purchaseReservesSupply(p)).length;
}

export async function findBuyerOpenPurchase(
  listingId: string,
  buyerId: string,
) {
  await expireStalePendingPurchases();
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
        purchaseReservesSupply(p) &&
        p.status !== "completed",
    );
    return row ?? null;
  }
  const rows = await prisma.purchase.findMany({
    where: {
      listingId,
      buyerId,
      status: { in: ["pending_payment", "pending_transfer"] },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.find((p) => purchaseReservesSupply(p)) ?? null;
}

export async function listClosedPrimarySaleIds(): Promise<Set<string>> {
  await expireStalePendingPurchases();
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryPurchases, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    const engine = getMemoryEngine();
    const counts = new Map<string, number>();
    for (const purchase of getMemoryPurchases()) {
      if (!purchaseReservesSupply(purchase)) continue;
      counts.set(purchase.listingId, (counts.get(purchase.listingId) ?? 0) + 1);
    }
    const ids = new Set<string>();
    for (const listing of engine.state.listings.values()) {
      const cap = primarySupplyCap(listing);
      if (cap != null && (counts.get(listing.id) ?? 0) >= cap) {
        ids.add(listing.id);
      }
    }
    return ids;
  }

  const listings = await prisma.listing.findMany({
    select: {
      id: true,
      type: true,
      maxSupply: true,
    },
  });
  const purchases = await prisma.purchase.findMany({
    where: {
      listingId: { in: listings.map((l) => l.id) },
      status: { in: ["completed", "pending_transfer", "pending_payment"] },
    },
    select: { listingId: true, status: true, createdAt: true },
  });
  const counts = new Map<string, number>();
  for (const purchase of purchases) {
    if (!purchaseReservesSupply(purchase)) continue;
    counts.set(purchase.listingId, (counts.get(purchase.listingId) ?? 0) + 1);
  }
  const ids = new Set<string>();
  for (const row of listings) {
    const cap = primarySupplyCap(row);
    if (cap != null && (counts.get(row.id) ?? 0) >= cap) {
      ids.add(row.id);
    }
  }
  return ids;
}
