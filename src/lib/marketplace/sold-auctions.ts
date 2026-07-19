import { prisma } from "@/lib/db";
import type { Listing } from "@/lib/discovery/types";
import { toListing } from "@/lib/data/mappers";

export type SoldAuction = {
  listing: Listing;
  amountUsd: number;
  soldAt: number;
  buyerId: string;
  buyerName: string;
  txHash: string | null;
  chain: string;
};

async function inMemoryMode(): Promise<boolean> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  return mode === "memory" || isMemoryMode();
}

/** Past auctions that cleared — successful primary sales. */
export async function listSoldAuctions(limit = 24): Promise<SoldAuction[]> {
  if (await inMemoryMode()) {
    const { getMemoryEngine, getMemoryPurchases } = await import(
      "@/lib/data/memory-store"
    );
    const engine = getMemoryEngine();
    const purchases = getMemoryPurchases()
      .slice()
      .sort((a, b) => b.soldAt - a.soldAt);

    const out: SoldAuction[] = [];
    for (const p of purchases) {
      const listing = engine.state.listings.get(p.listingId);
      if (!listing || listing.type !== "auction") continue;
      const buyer = engine.state.creators.get(p.buyerId);
      out.push({
        listing,
        amountUsd: p.amountUsd,
        soldAt: p.soldAt,
        buyerId: p.buyerId,
        buyerName: buyer?.displayName ?? p.buyerId,
        txHash: p.txHash,
        chain: listing.chain,
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  const rows = await prisma.purchase.findMany({
    where: { listing: { type: "auction" } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      listing: true,
      buyer: { select: { id: true, displayName: true } },
    },
  });

  return rows.map((r) => ({
    listing: toListing(r.listing),
    amountUsd: r.amountUsd,
    soldAt: r.createdAt.getTime(),
    buyerId: r.buyerId,
    buyerName: r.buyer.displayName,
    txHash: r.txHash,
    chain: r.chain,
  }));
}
