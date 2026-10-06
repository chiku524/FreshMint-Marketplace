import { prisma } from "@/lib/db";

/** OpenSea-style event kinds on an NFT / listing page. */
export type ListingActivityKind =
  | "mint"
  | "list"
  | "offer"
  | "bid"
  | "sale"
  | "transfer"
  | "cancel";

export type ListingActivityEvent = {
  id: string;
  kind: ListingActivityKind;
  at: number;
  actorId: string | null;
  actorName: string | null;
  amountUsd: number | null;
  txHash: string | null;
  chain: string | null;
  network: string | null;
  /** Short headline, e.g. "Sold" / "Offer". */
  label: string;
  /** Extra context under the label. */
  detail: string | null;
};

const KIND_LABEL: Record<ListingActivityKind, string> = {
  mint: "Minted",
  list: "Listed",
  offer: "Offer",
  bid: "Bid",
  sale: "Sold",
  transfer: "Transferred",
  cancel: "Unlisted",
};

function usd(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return `$${Math.round(n * 100) / 100}`;
}

function nameFromMap(
  map: Map<string, string>,
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  return map.get(id) ?? null;
}

async function resolveDisplayNames(
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string>();
  if (!unique.length) return map;

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    const engine = getMemoryEngine();
    for (const id of unique) {
      const c = engine.state.creators.get(id);
      if (c?.displayName) map.set(id, c.displayName);
    }
    return map;
  }

  const rows = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, displayName: true },
  });
  for (const row of rows) map.set(row.id, row.displayName);
  return map;
}

type ListingSnap = {
  id: string;
  creatorId: string;
  sellerId: string | null;
  createdAt: number;
  softLaunchedAt: number | null;
  stage: string;
  delisted: boolean;
  chain: string;
  network: string;
  mintTxHash: string | null;
  contractAddress: string | null;
  tokenId: string | null;
  priceUsd: number | null;
  isSecondary: boolean;
  originListingId: string | null;
};

async function loadListingSnap(listingId: string): Promise<ListingSnap | null> {
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
      sellerId: l.sellerId ?? null,
      createdAt: l.createdAt,
      softLaunchedAt: l.softLaunchedAt,
      stage: l.stage,
      delisted: Boolean(l.delisted),
      chain: l.chain,
      network: l.network,
      mintTxHash: l.mintTxHash ?? null,
      contractAddress: l.contractAddress ?? null,
      tokenId: l.tokenId ?? null,
      priceUsd: l.priceUsd,
      isSecondary: Boolean(l.isSecondary),
      originListingId: l.originListingId ?? null,
    };
  }
  const row = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!row) return null;
  return {
    id: row.id,
    creatorId: row.creatorId,
    sellerId: row.sellerId ?? null,
    createdAt: row.createdAt.getTime(),
    softLaunchedAt: row.softLaunchedAt?.getTime() ?? null,
    stage: row.stage,
    delisted: row.delisted,
    chain: row.chain,
    network: row.network,
    mintTxHash: row.mintTxHash ?? null,
    contractAddress: row.contractAddress ?? null,
    tokenId: row.tokenId ?? null,
    priceUsd: row.priceUsd,
    isSecondary: Boolean(row.isSecondary),
    originListingId: row.originListingId ?? null,
  };
}

/**
 * Build an OpenSea-style activity timeline from existing marketplace rows
 * (mint/list fields, purchases, offers, bids, secondary relists).
 */
export async function listListingActivity(
  listingId: string,
  limit = 40,
): Promise<ListingActivityEvent[]> {
  const listing = await loadListingSnap(listingId);
  if (!listing) return [];

  const events: ListingActivityEvent[] = [];
  const actorIds: string[] = [listing.creatorId];
  if (listing.sellerId) actorIds.push(listing.sellerId);

  const minted = Boolean(
    listing.tokenId && listing.contractAddress && listing.mintTxHash,
  );

  // Mint — use listing creation as timestamp proxy when only mint fields exist.
  if (minted) {
    events.push({
      id: `mint:${listing.id}`,
      kind: "mint",
      at: listing.createdAt,
      actorId: listing.creatorId,
      actorName: null,
      amountUsd: null,
      txHash: listing.mintTxHash,
      chain: listing.chain,
      network: listing.network,
      label: KIND_LABEL.mint,
      detail: listing.tokenId ? `Token ${listing.tokenId}` : null,
    });
  }

  // Listed / soft-launched (primary or secondary).
  if (listing.softLaunchedAt && listing.stage !== "draft") {
    const seller = listing.sellerId ?? listing.creatorId;
    actorIds.push(seller);
    events.push({
      id: `list:${listing.id}`,
      kind: "list",
      at: listing.softLaunchedAt,
      actorId: seller,
      actorName: null,
      amountUsd: listing.priceUsd,
      txHash: null,
      chain: listing.chain,
      network: listing.network,
      label: listing.isSecondary ? "Relisted" : KIND_LABEL.list,
      detail: usd(listing.priceUsd),
    });
  }

  if (listing.delisted) {
    const when = listing.softLaunchedAt ?? listing.createdAt;
    events.push({
      id: `cancel:${listing.id}`,
      kind: "cancel",
      at: when + 1,
      actorId: listing.sellerId ?? listing.creatorId,
      actorName: null,
      amountUsd: null,
      txHash: null,
      chain: listing.chain,
      network: listing.network,
      label: KIND_LABEL.cancel,
      detail: "Removed from sale",
    });
  }

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryPurchases, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );
  const { listOffersForListing } = await import("@/lib/marketplace/offers");
  const { listBidsForListing } = await import(
    "@/lib/marketplace/english-auction"
  );

  const mode = await ensureDatabaseReady();
  const memory = mode === "memory" || isMemoryMode();

  // Purchases → sale + transfer.
  if (memory) {
    for (const p of getMemoryPurchases()) {
      if (p.listingId !== listingId) continue;
      if (p.status !== "completed" && p.status !== "pending_transfer") continue;
      actorIds.push(p.buyerId);
      const at = p.soldAt ?? 0;
      events.push({
        id: `sale:${p.id}`,
        kind: "sale",
        at,
        actorId: p.buyerId,
        actorName: null,
        amountUsd: p.amountUsd,
        txHash: p.paymentTxHash ?? p.txHash ?? null,
        chain: p.chain ?? listing.chain,
        network: listing.network,
        label: KIND_LABEL.sale,
        detail: usd(p.amountUsd),
      });
      if (p.status === "completed" && p.txHash) {
        events.push({
          id: `transfer:${p.id}`,
          kind: "transfer",
          at: at + 1,
          actorId: p.buyerId,
          actorName: null,
          amountUsd: null,
          txHash: p.txHash,
          chain: p.chain ?? listing.chain,
          network: listing.network,
          label: KIND_LABEL.transfer,
          detail: "NFT to buyer wallet",
        });
      }
    }
  } else {
    const purchases = await prisma.purchase.findMany({
      where: {
        listingId,
        status: { in: ["completed", "pending_transfer"] },
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    });
    for (const p of purchases) {
      actorIds.push(p.buyerId);
      const at = p.createdAt.getTime();
      events.push({
        id: `sale:${p.id}`,
        kind: "sale",
        at,
        actorId: p.buyerId,
        actorName: null,
        amountUsd: p.amountUsd,
        txHash: p.paymentTxHash ?? p.txHash ?? null,
        chain: p.chain ?? listing.chain,
        network: p.payNetwork ?? listing.network,
        label: KIND_LABEL.sale,
        detail: usd(p.amountUsd),
      });
      if (p.status === "completed" && p.txHash) {
        events.push({
          id: `transfer:${p.id}`,
          kind: "transfer",
          at: at + 1,
          actorId: p.buyerId,
          actorName: null,
          amountUsd: null,
          txHash: p.txHash,
          chain: p.chain ?? listing.chain,
          network: p.payNetwork ?? listing.network,
          label: KIND_LABEL.transfer,
          detail: "NFT to buyer wallet",
        });
      }
    }
  }

  // Offers.
  const offers = await listOffersForListing(listingId, 40);
  for (const o of offers) {
    actorIds.push(o.offererId);
    const statusNote =
      o.status === "accepted"
        ? "Accepted"
        : o.status === "cancelled"
          ? "Cancelled"
          : o.status === "expired"
            ? "Expired"
            : "Open";
    events.push({
      id: `offer:${o.id}`,
      kind: "offer",
      at: o.createdAt,
      actorId: o.offererId,
      actorName: null,
      amountUsd: o.amountUsd,
      txHash: null,
      chain: listing.chain,
      network: listing.network,
      label: KIND_LABEL.offer,
      detail: `${usd(o.amountUsd) ?? "—"} · ${statusNote}`,
    });
  }

  // Bids (English auctions).
  const bids = await listBidsForListing(listingId, 40);
  for (const b of bids) {
    actorIds.push(b.bidderId);
    events.push({
      id: `bid:${b.id}`,
      kind: "bid",
      at: b.createdAt,
      actorId: b.bidderId,
      actorName: null,
      amountUsd: b.amountUsd,
      txHash: null,
      chain: listing.chain,
      network: listing.network,
      label: KIND_LABEL.bid,
      detail: usd(b.amountUsd),
    });
  }

  // Secondary relists that point at this origin NFT.
  if (memory) {
    const engine = getMemoryEngine();
    for (const l of engine.state.listings.values()) {
      if (!l.isSecondary || l.originListingId !== listingId) continue;
      if (!l.softLaunchedAt) continue;
      const seller = l.sellerId ?? l.creatorId;
      actorIds.push(seller);
      events.push({
        id: `relist:${l.id}`,
        kind: "list",
        at: l.softLaunchedAt,
        actorId: seller,
        actorName: null,
        amountUsd: l.priceUsd,
        txHash: null,
        chain: l.chain,
        network: l.network,
        label: "Relisted",
        detail: usd(l.priceUsd),
      });
    }
  } else if (!listing.isSecondary) {
    const relists = await prisma.listing.findMany({
      where: {
        originListingId: listingId,
        isSecondary: true,
        softLaunchedAt: { not: null },
      },
      orderBy: { softLaunchedAt: "desc" },
      take: 20,
    });
    for (const l of relists) {
      const seller = l.sellerId ?? l.creatorId;
      actorIds.push(seller);
      events.push({
        id: `relist:${l.id}`,
        kind: "list",
        at: l.softLaunchedAt!.getTime(),
        actorId: seller,
        actorName: null,
        amountUsd: l.priceUsd,
        txHash: null,
        chain: l.chain,
        network: l.network,
        label: "Relisted",
        detail: usd(l.priceUsd),
      });
    }
  }

  const names = await resolveDisplayNames(actorIds);
  for (const ev of events) {
    ev.actorName = nameFromMap(names, ev.actorId);
  }

  return events
    .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/**
 * Recent activity across pieces in a collection (for collection Activity tab).
 */
export async function listCollectionActivity(
  collectionId: string,
  limit = 30,
): Promise<(ListingActivityEvent & { listingId: string; listingTitle: string })[]> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();
  const memory = mode === "memory" || isMemoryMode();

  type Piece = { id: string; title: string };
  let pieces: Piece[] = [];

  if (memory) {
    pieces = [...getMemoryEngine().state.listings.values()]
      .filter((l) => l.collectionId === collectionId)
      .map((l) => ({ id: l.id, title: l.title }));
  } else {
    const rows = await prisma.listing.findMany({
      where: { collectionId },
      select: { id: true, title: true },
      take: 80,
      orderBy: { createdAt: "desc" },
    });
    pieces = rows;
  }

  const out: (ListingActivityEvent & {
    listingId: string;
    listingTitle: string;
  })[] = [];

  // Cap per-listing fan-out so large collections stay cheap.
  const perListing = Math.max(4, Math.ceil(limit / Math.max(pieces.length, 1)));
  for (const piece of pieces.slice(0, 40)) {
    const events = await listListingActivity(piece.id, perListing);
    for (const ev of events) {
      out.push({ ...ev, listingId: piece.id, listingTitle: piece.title });
    }
  }

  return out
    .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id))
    .slice(0, limit);
}
