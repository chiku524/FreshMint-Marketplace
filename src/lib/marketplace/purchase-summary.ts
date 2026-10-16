/**
 * Plain-language summary for the listing page price card: what it costs, how
 * to buy it (sale mode), when, and whether it can be bought right now.
 */
export type PurchaseStatus =
  | "available"
  | "upcoming"
  | "ended"
  | "sold"
  | "not_minted"
  | "unlisted";

export type PurchaseSummaryInput = {
  saleMode: string;
  listingType: string;
  displayPriceUsd: number | null;
  startingBidUsd?: number | null;
  currentHighBidUsd?: number | null;
  minBidUsd?: number | null;
  reserveUsd?: number | null;
  reserveMet?: boolean;
  startsAt?: number | null;
  endsAt?: number | null;
  dropState?: string | null;
  cap: number | null;
  isSold: boolean;
  delisted: boolean;
  minted: boolean;
  isSecondary: boolean;
  now: number;
};

export type PurchaseSummary = {
  priceLabel: string;
  amount: string;
  howToBuy: string;
  timing: string | null;
  status: PurchaseStatus;
  statusText: string;
  supply: string | null;
};

export function formatUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return n >= 1000
    ? `$${Math.round(n).toLocaleString("en-US")}`
    : `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
}

export function buildPurchaseSummary(i: PurchaseSummaryInput): PurchaseSummary {
  const mode = i.saleMode;
  const english = mode === "english";
  const dutch = mode === "dutch";
  const timed = mode === "timed_window" || (i.listingType === "auction" && !english && !dutch);
  const hasBids = english && i.currentHighBidUsd != null && i.currentHighBidUsd > 0;

  const priceLabel = english
    ? hasBids
      ? "Current bid"
      : "Starting bid"
    : dutch
      ? "Current price"
      : "Price";
  const amount = english
    ? formatUsd(hasBids ? i.currentHighBidUsd : (i.startingBidUsd ?? i.displayPriceUsd))
    : formatUsd(i.displayPriceUsd);

  const howToBuy = english
    ? `Open auction: highest bid wins when it ends.${i.reserveUsd ? (i.reserveMet ? " Reserve met." : " Reserve not met yet.") : ""}`
    : dutch
      ? "Falling price: buy now at the current price, which drops until it hits the floor."
      : timed
        ? "Timed sale: buy at the list price while the window is open."
        : i.listingType === "open_edition"
          ? "Open edition: buy as many as you like at the list price."
          : "Fixed price: buy instantly.";

  let timing: string | null = null;
  const upcoming = i.startsAt != null && i.now < i.startsAt;
  const ended = i.endsAt != null && i.now > i.endsAt;
  if (upcoming) timing = `Starts in ${formatDuration(i.startsAt! - i.now)}`;
  else if (i.endsAt != null && !ended) timing = `Ends in ${formatDuration(i.endsAt - i.now)}`;
  else if (ended) timing = "Ended";

  let status: PurchaseStatus = "available";
  let statusText = english ? "Bidding is open" : "Available now";
  if (i.delisted) {
    status = "unlisted";
    statusText = "Not listed for sale";
  } else if (i.isSold) {
    status = "sold";
    statusText = i.isSecondary ? "Sold" : "Sold out";
  } else if (!i.minted) {
    status = "not_minted";
    statusText = "Not on sale yet \u2014 the creator still needs to mint this piece";
  } else if (upcoming || i.dropState === "upcoming") {
    status = "upcoming";
    statusText = "Not open yet";
  } else if (ended || i.dropState === "ended") {
    status = "ended";
    statusText = english ? "Auction ended" : "Sale window ended";
  }

  const supply =
    i.cap === 1
      ? "1 of 1"
      : i.cap != null
        ? `Edition of ${i.cap.toLocaleString("en-US")}`
        : i.listingType === "open_edition"
          ? "Open edition"
          : null;

  if (amount === "\u2014") {
    return {
      priceLabel: "Price",
      amount: "Price not set",
      howToBuy: "The creator hasn't set a price yet. Follow them to hear when it goes on sale.",
      timing,
      status: status === "available" ? "unlisted" : status,
      statusText: status === "available" ? "Not for sale yet" : statusText,
      supply,
    };
  }

  // "Buy instantly" contradicts "Not on sale yet"; explain what happens next instead.
  const how =
    status === "not_minted"
      ? "Follow the creator or save it to hear when it goes on sale."
      : status === "sold" || status === "unlisted"
        ? ""
        : howToBuy;
  return { priceLabel, amount, howToBuy: how, timing, status, statusText, supply };
}