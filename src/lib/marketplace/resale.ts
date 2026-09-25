/**
 * Secondary / resale MVP: owners of completed primary purchases can list
 * the same work at a fixed price. Creator royalty + platform fee displayed
 * at checkout; soft (off-chain) settle — same as primary for now.
 */
import { splitSaleProceeds } from "@/lib/fees/platform";
import {
  DEFAULT_CREATOR_RESALE_ROYALTY_BPS,
} from "@/lib/marketplace/trust";

export type ResaleFeePreview = {
  amountUsd: number;
  platformFeeUsd: number;
  creatorRoyaltyUsd: number;
  sellerNetUsd: number;
  creatorRoyaltyBps: number;
  platformFeeBps: number;
};

export function previewResaleFees(input: {
  amountUsd: number;
  creatorRoyaltyBps?: number | null;
}): ResaleFeePreview {
  const amount = Math.max(0, Number(input.amountUsd) || 0);
  const royaltyBps = Math.max(
    0,
    Math.min(
      2000,
      Number(input.creatorRoyaltyBps ?? DEFAULT_CREATOR_RESALE_ROYALTY_BPS) || 0,
    ),
  );
  const platform = splitSaleProceeds(amount);
  const creatorRoyaltyUsd =
    Math.round(((amount * royaltyBps) / 10_000) * 100) / 100;
  // Seller receives listed price minus platform fee minus creator royalty.
  const sellerNetUsd =
    Math.round((amount - platform.feeTotalUsd - creatorRoyaltyUsd) * 100) / 100;
  return {
    amountUsd: amount,
    platformFeeUsd: platform.feeTotalUsd,
    creatorRoyaltyUsd,
    sellerNetUsd: Math.max(0, sellerNetUsd),
    creatorRoyaltyBps: royaltyBps,
    platformFeeBps: platform.totalBps,
  };
}

export function canListResale(input: {
  actorId: string;
  purchase: {
    buyerId: string;
    status?: string | null;
    listingId: string;
  };
  originListing: {
    id: string;
    delisted?: boolean;
    stage?: string | null;
  };
  existingSecondaryForOrigin: boolean;
}): { ok: true } | { ok: false; error: string } {
  if ((input.purchase.status ?? "completed") !== "completed") {
    return { ok: false, error: "purchase_not_completed" };
  }
  if (input.purchase.buyerId !== input.actorId) {
    return { ok: false, error: "not_owner" };
  }
  if (input.existingSecondaryForOrigin) {
    return { ok: false, error: "already_listed" };
  }
  return { ok: true };
}
