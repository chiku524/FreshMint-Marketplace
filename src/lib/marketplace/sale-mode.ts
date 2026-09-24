import type { ListingType } from "@/lib/discovery/types";

/** Creator-facing sale / bidding mode. Independent of ListingType for discovery. */
export type SaleMode = "fixed" | "timed_window" | "english";

export const SALE_MODE_LABELS: Record<SaleMode, string> = {
  fixed: "Fixed price",
  timed_window: "Timed window (buy at list price)",
  english: "English auction (open bidding)",
};

export const SALE_MODE_BADGES: Record<SaleMode, string> = {
  fixed: "Fixed price",
  timed_window: "Timed window · buy at list price",
  english: "English auction · open bidding",
};

/**
 * Discovery type mapping:
 * - timed_window + english → type="auction" (keeps timed-drops discovery)
 * - fixed keeps the provided non-auction type
 *
 * Documented mapping: legacy type==="auction" with no saleMode → timed_window.
 */
export function listingTypeForSaleMode(
  saleMode: SaleMode,
  fallback: ListingType = "single",
): ListingType {
  if (saleMode === "timed_window" || saleMode === "english") return "auction";
  return fallback === "auction" ? "single" : fallback;
}

export function parseSaleMode(value: unknown): SaleMode {
  if (value === "timed_window" || value === "english" || value === "fixed") {
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
  return mode === "timed_window" || mode === "english";
}
