import type { ListingType } from "@/lib/discovery/types";

/** Creator-facing sale / bidding mode. Independent of ListingType for discovery. */
export type SaleMode = "fixed" | "timed_window" | "english" | "dutch";

/** Happy-path labels (OpenSea-like). Auctions stay clear but secondary. */
export const SALE_MODE_LABELS: Record<SaleMode, string> = {
  fixed: "Buy now",
  timed_window: "Timed listing",
  english: "English auction",
  dutch: "Dutch auction",
};

export const SALE_MODE_BADGES: Record<SaleMode, string> = {
  fixed: "Buy now",
  timed_window: "Timed listing",
  english: "English auction",
  dutch: "Dutch auction",
};

/**
 * Discovery type mapping:
 * - timed_window + english + dutch → type="auction" (keeps timed-drops discovery)
 * - fixed keeps the provided non-auction type
 *
 * Documented mapping: legacy type==="auction" with no saleMode → timed_window.
 */
export function listingTypeForSaleMode(
  saleMode: SaleMode,
  fallback: ListingType = "single",
): ListingType {
  if (
    saleMode === "timed_window" ||
    saleMode === "english" ||
    saleMode === "dutch"
  ) {
    return "auction";
  }
  return fallback === "auction" ? "single" : fallback;
}

export function parseSaleMode(value: unknown): SaleMode {
  if (
    value === "timed_window" ||
    value === "english" ||
    value === "dutch" ||
    value === "fixed"
  ) {
    return value;
  }
  return "fixed";
}

/** Legacy: type===auction with no/invalid saleMode → timed_window. */
export function resolveSaleMode(listing: {
  type: string;
  saleMode?: string | null;
}): SaleMode {
  if (
    listing.saleMode === "timed_window" ||
    listing.saleMode === "english" ||
    listing.saleMode === "dutch" ||
    listing.saleMode === "fixed"
  ) {
    return listing.saleMode;
  }
  if (listing.type === "auction") return "timed_window";
  return "fixed";
}

export function saleModeLabel(listing: {
  type: string;
  saleMode?: string | null;
}): string {
  return SALE_MODE_LABELS[resolveSaleMode(listing)];
}

export function saleModeBadge(listing: {
  type: string;
  saleMode?: string | null;
}): string {
  return SALE_MODE_BADGES[resolveSaleMode(listing)];
}

/** Min next bid: max(starting, high+increment). Increment = max($1, 5% of high). */
export function minNextBidUsd(input: {
  startingBidUsd?: number | null;
  priceUsd?: number | null;
  currentHighBidUsd?: number | null;
}): number {
  const start = Math.max(
    0,
    Number(input.startingBidUsd ?? input.priceUsd ?? 0) || 0,
  );
  const high = Number(input.currentHighBidUsd ?? 0) || 0;
  if (high <= 0) return start > 0 ? start : 1;
  const increment = Math.max(1, Math.round(high * 0.05 * 100) / 100);
  return Math.round((high + increment) * 100) / 100;
}

export function isTimedSaleMode(mode: SaleMode): boolean {
  return mode === "timed_window" || mode === "english" || mode === "dutch";
}

export function isAuctionBiddingMode(mode: SaleMode): boolean {
  return mode === "english" || mode === "dutch";
}

/**
 * Dutch auction: price declines linearly from start → floor over the window.
 * Buy now at the current price while live.
 */
export function dutchCurrentPriceUsd(input: {
  startingBidUsd?: number | null;
  priceUsd?: number | null;
  reserveUsd?: number | null;
  auctionStartsAt?: number | null;
  auctionEndsAt?: number | null;
  now?: number;
}): number | null {
  const start = Math.max(
    0,
    Number(input.startingBidUsd ?? input.priceUsd ?? 0) || 0,
  );
  if (!(start > 0)) return null;
  const floorRaw = Number(input.reserveUsd ?? 0) || 0;
  const floor = floorRaw > 0 && floorRaw < start ? floorRaw : Math.max(1, start * 0.1);
  const startsAt = input.auctionStartsAt ?? null;
  const endsAt = input.auctionEndsAt ?? null;
  const now = input.now ?? Date.now();
  if (startsAt == null || endsAt == null || endsAt <= startsAt) {
    return Math.round(start * 100) / 100;
  }
  if (now <= startsAt) return Math.round(start * 100) / 100;
  if (now >= endsAt) return Math.round(floor * 100) / 100;
  const t = (now - startsAt) / (endsAt - startsAt);
  const price = start - (start - floor) * t;
  return Math.round(price * 100) / 100;
}
