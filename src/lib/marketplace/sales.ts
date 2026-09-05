import { prisma } from "@/lib/db";
import type { ListingType } from "@/lib/discovery/types";

/** Open editions can sell many times; 1/1s, collection pieces, and auctions cannot. */
export function allowsRepeatPrimaryPurchase(type: ListingType | string): boolean {
  return type === "open_edition";
}

export async function listClosedPrimarySaleIds(): Promise<Set<string>> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryPurchases, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    const engine = getMemoryEngine();
    const ids = new Set<string>();
    for (const purchase of getMemoryPurchases()) {
      const listing = engine.state.listings.get(purchase.listingId);
      if (listing && !allowsRepeatPrimaryPurchase(listing.type)) {
        ids.add(purchase.listingId);
      }
    }
    return ids;
  }

  const rows = await prisma.listing.findMany({
    where: {
      type: { not: "open_edition" },
      purchases: { some: {} },
    },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}
