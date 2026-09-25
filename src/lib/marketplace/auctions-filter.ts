import type { Listing } from "@/lib/discovery/types";
import { resolveSaleMode, type SaleMode } from "@/lib/marketplace/sale-mode";

/** Query param on /auctions: All | Timed drops | English. */
export type AuctionsSaleModeFilter = "all" | "timed_window" | "english";

export const AUCTIONS_SALE_MODE_QUERY = "saleMode";

export function parseAuctionsSaleMode(
  value: unknown,
): AuctionsSaleModeFilter {
  if (value === "english" || value === "timed_window" || value === "all") {
    return value;
  }
  // Accept common aliases from links / typos
  if (value === "timed" || value === "timed_drop" || value === "drop") {
    return "timed_window";
  }
  return "all";
}

export function auctionsSaleModeFromSearchParams(
  sp: Record<string, string | string[] | undefined> | URLSearchParams,
): AuctionsSaleModeFilter {
  let raw: unknown;
  if (sp instanceof URLSearchParams) {
    raw = sp.get(AUCTIONS_SALE_MODE_QUERY);
  } else {
    const v = sp[AUCTIONS_SALE_MODE_QUERY];
    raw = Array.isArray(v) ? v[0] : v;
  }
  return parseAuctionsSaleMode(raw);
}

export function auctionsHref(filter: AuctionsSaleModeFilter): string {
  if (filter === "all") return "/auctions";
  return `/auctions?${AUCTIONS_SALE_MODE_QUERY}=${filter}`;
}

export function listingMatchesAuctionsFilter(
  listing: { type: string; saleMode?: string | null },
  filter: AuctionsSaleModeFilter,
): boolean {
  if (filter === "all") return true;
  return resolveSaleMode(listing) === filter;
}

export function filterListingsByAuctionsSaleMode<T extends Listing>(
  listings: T[],
  filter: AuctionsSaleModeFilter,
): T[] {
  if (filter === "all") return listings;
  return listings.filter((l) => listingMatchesAuctionsFilter(l, filter));
}

export function auctionsFilterLabel(filter: AuctionsSaleModeFilter): string {
  switch (filter) {
    case "english":
      return "English auctions";
    case "timed_window":
      return "Timed drops";
    default:
      return "All";
  }
}

/** Live auction-type listings for the page (window open). */
export function isLiveAuctionListing(
  listing: Listing,
  now = Date.now(),
): boolean {
  if (listing.type !== "auction" || listing.delisted) return false;
  if (listing.auctionStartsAt == null || listing.auctionEndsAt == null) {
    return false;
  }
  if (now < listing.auctionStartsAt || now > listing.auctionEndsAt) {
    return false;
  }
  return (
    listing.stage === "soft_launch" ||
    listing.stage === "rising_eligible" ||
    listing.stage === "featured_eligible" ||
    listing.stage === "featured"
  );
}

export function saleModeOfAuctionListing(listing: {
  type: string;
  saleMode?: string | null;
}): Extract<SaleMode, "timed_window" | "english"> {
  const mode = resolveSaleMode(listing);
  return mode === "english" ? "english" : "timed_window";
}
