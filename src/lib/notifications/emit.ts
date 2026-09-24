import { createNotification, notificationDedupeKey } from "@/lib/notifications";
import {
  ENGLISH_WINNER_PAYMENT_DEADLINE_MS,
} from "@/lib/marketplace/lifecycle";

function formatDeadline(deadlineAt: number): string {
  try {
    return new Date(deadlineAt).toLocaleString();
  } catch {
    return "soon";
  }
}

export async function notifyEnglishWin(input: {
  winnerId: string;
  listingId: string;
  listingTitle?: string;
  purchaseId: string;
  amountUsd: number;
  awardedAt: number;
  cascaded?: boolean;
}) {
  const deadlineAt = input.awardedAt + ENGLISH_WINNER_PAYMENT_DEADLINE_MS;
  const title = input.cascaded
    ? "You’re next — complete payment"
    : "You won — complete payment";
  const body = input.cascaded
    ? `The prior winner’s payment window expired. Pay $${input.amountUsd} for “${input.listingTitle ?? "listing"}” by ${formatDeadline(deadlineAt)}.`
    : `You won “${input.listingTitle ?? "listing"}” at $${input.amountUsd}. Pay by ${formatDeadline(deadlineAt)}.`;
  return createNotification({
    userId: input.winnerId,
    type: input.cascaded ? "english_cascade" : "english_win",
    title,
    body,
    href: `/listings/${input.listingId}`,
    dedupeKey: notificationDedupeKey(
      input.cascaded ? "english_cascade" : "english_win",
      input.listingId,
      input.purchaseId,
    ),
    payload: {
      listingId: input.listingId,
      purchaseId: input.purchaseId,
      amountUsd: input.amountUsd,
      deadlineAt,
      cascaded: Boolean(input.cascaded),
    },
    now: input.awardedAt,
  });
}

export async function notifyEnglishExpired(input: {
  winnerId: string;
  listingId: string;
  listingTitle?: string;
  purchaseId: string;
  amountUsd: number;
  now?: number;
}) {
  return createNotification({
    userId: input.winnerId,
    type: "english_expired",
    title: "Payment window expired",
    body: `Your winning checkout for “${input.listingTitle ?? "listing"}” ($${input.amountUsd}) expired. The award may pass to the next bidder.`,
    href: `/listings/${input.listingId}`,
    dedupeKey: notificationDedupeKey(
      "english_expired",
      input.listingId,
      input.purchaseId,
    ),
    payload: {
      listingId: input.listingId,
      purchaseId: input.purchaseId,
      amountUsd: input.amountUsd,
    },
    now: input.now,
  });
}

export async function notifyEnglishOutbid(input: {
  previousHighBidderId: string;
  listingId: string;
  listingTitle?: string;
  bidId: string;
  newAmountUsd: number;
  now?: number;
}) {
  if (!input.previousHighBidderId) return { created: false, notification: null };
  return createNotification({
    userId: input.previousHighBidderId,
    type: "english_outbid",
    title: "You’ve been outbid",
    body: `A new bid of $${input.newAmountUsd} was placed on “${input.listingTitle ?? "listing"}”.`,
    href: `/listings/${input.listingId}`,
    dedupeKey: notificationDedupeKey(
      "english_outbid",
      input.listingId,
      input.bidId,
    ),
    payload: {
      listingId: input.listingId,
      bidId: input.bidId,
      amountUsd: input.newAmountUsd,
    },
    now: input.now,
  });
}

export async function notifyCreatorEnglishAwaiting(input: {
  creatorId: string;
  listingId: string;
  listingTitle?: string;
  purchaseId: string;
  amountUsd: number;
  winnerId: string;
  cascaded?: boolean;
  now?: number;
}) {
  return createNotification({
    userId: input.creatorId,
    type: "creator_english_awaiting",
    title: input.cascaded
      ? "English auction — passed to runner-up"
      : "English auction — awaiting winner payment",
    body: `“${input.listingTitle ?? "listing"}” ended. Awaiting $${input.amountUsd} payment.`,
    href: `/listings/${input.listingId}`,
    dedupeKey: notificationDedupeKey(
      "creator_english_awaiting",
      input.listingId,
      input.purchaseId,
    ),
    payload: {
      listingId: input.listingId,
      purchaseId: input.purchaseId,
      amountUsd: input.amountUsd,
      winnerId: input.winnerId,
      cascaded: Boolean(input.cascaded),
    },
    now: input.now,
  });
}

export async function notifyCreatorEnglishUnsold(input: {
  creatorId: string;
  listingId: string;
  listingTitle?: string;
  reason: string;
  auctionEndsAt: number;
  now?: number;
}) {
  return createNotification({
    userId: input.creatorId,
    type: "creator_english_unsold",
    title: "English auction ended unsold",
    body: `“${input.listingTitle ?? "listing"}” ended without a completed sale (${input.reason.replaceAll("_", " ")}). You can relist or switch sale mode.`,
    href: `/listings/${input.listingId}`,
    dedupeKey: notificationDedupeKey(
      "creator_english_unsold",
      input.listingId,
      input.auctionEndsAt,
      input.reason,
    ),
    payload: {
      listingId: input.listingId,
      reason: input.reason,
    },
    now: input.now,
  });
}

export async function notifyCreatorEnglishSold(input: {
  creatorId: string;
  listingId: string;
  listingTitle?: string;
  purchaseId: string;
  amountUsd: number;
  now?: number;
}) {
  return createNotification({
    userId: input.creatorId,
    type: "creator_english_sold",
    title: "English auction sold",
    body: `“${input.listingTitle ?? "listing"}” sold for $${input.amountUsd}.`,
    href: `/listings/${input.listingId}`,
    dedupeKey: notificationDedupeKey(
      "creator_english_sold",
      input.listingId,
      input.purchaseId,
    ),
    payload: {
      listingId: input.listingId,
      purchaseId: input.purchaseId,
      amountUsd: input.amountUsd,
    },
    now: input.now,
  });
}

export async function notifyCreatorItemSold(input: {
  creatorId: string;
  listingId: string;
  listingTitle?: string;
  purchaseId: string;
  amountUsd: number;
  now?: number;
}) {
  return createNotification({
    userId: input.creatorId,
    type: "item_sold",
    title: "Item sold",
    body: `“${input.listingTitle ?? "listing"}” sold for $${input.amountUsd}.`,
    href: `/listings/${input.listingId}`,
    dedupeKey: notificationDedupeKey("item_sold", input.purchaseId),
    payload: {
      listingId: input.listingId,
      purchaseId: input.purchaseId,
      amountUsd: input.amountUsd,
    },
    now: input.now,
  });
}

export async function notifyCreatorPackageSold(input: {
  creatorId: string;
  collectionId: string;
  collectionTitle?: string;
  packagePurchaseId: string;
  amountUsd: number;
  listingCount: number;
  now?: number;
}) {
  return createNotification({
    userId: input.creatorId,
    type: "package_sold",
    title: "Package sold",
    body: `Package of ${input.listingCount} works from “${input.collectionTitle ?? "collection"}” sold for $${input.amountUsd}.`,
    href: `/collections/${input.collectionId}`,
    dedupeKey: notificationDedupeKey("package_sold", input.packagePurchaseId),
    payload: {
      collectionId: input.collectionId,
      packagePurchaseId: input.packagePurchaseId,
      amountUsd: input.amountUsd,
      listingCount: input.listingCount,
    },
    now: input.now,
  });
}
