import { prisma } from "@/lib/db";
import type { ListingType } from "@/lib/discovery/types";
import { primarySupplyCap } from "@/lib/marketplace/drops";

/** Open editions (or any listing with maxSupply > 1) can sell more than once. */
export function allowsRepeatPrimaryPurchase(
  listing: { type: ListingType | string; maxSupply?: number | null },
): boolean {
  const cap = primarySupplyCap(listing);
  return cap == null || cap > 1;
}

export async function listClosedPrimarySaleIds(): Promise<Set<string>> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryPurchases, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    const engine = getMemoryEngine();
    const counts = new Map<string, number>();
    for (const purchase of getMemoryPurchases()) {
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

  const rows = await prisma.listing.findMany({
    select: {
      id: true,
      type: true,
      maxSupply: true,
      _count: { select: { purchases: true } },
    },
  });
  const ids = new Set<string>();
  for (const row of rows) {
    const cap = primarySupplyCap(row);
    if (cap != null && row._count.purchases >= cap) {
      ids.add(row.id);
    }
  }
  return ids;
}
