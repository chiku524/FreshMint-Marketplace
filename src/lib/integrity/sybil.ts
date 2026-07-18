import { DISCOVERY_CONFIG } from "@/lib/discovery/config";
import { prisma } from "@/lib/db";

export interface SybilCheckResult {
  allowed: boolean;
  reason?: string;
  trustWeight: number;
}

/**
 * Soft sybil resistance for engagement signals.
 * Does not block browsing; reduces or rejects farmable actions.
 */
export async function checkSignalSybil(input: {
  viewerId: string | null | undefined;
  listingId: string;
  type: string;
}): Promise<SybilCheckResult> {
  if (!input.viewerId) {
    // Anonymous: allow low-trust impressions/dwell only.
    if (input.type === "save" || input.type === "follow") {
      return { allowed: false, reason: "login_required", trustWeight: 0 };
    }
    return { allowed: true, trustWeight: 0.35 };
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.signalEvent.count({
    where: {
      viewerId: input.viewerId,
      listingId: input.listingId,
      createdAt: { gte: hourAgo },
    },
  });

  if (recent >= DISCOVERY_CONFIG.sybil.maxSignalsPerViewerListingPerHour) {
    return {
      allowed: false,
      reason: "viewer_listing_rate_limit",
      trustWeight: 0,
    };
  }

  const viewer = await prisma.user.findUnique({
    where: { id: input.viewerId },
  });
  if (!viewer) {
    return { allowed: false, reason: "viewer_missing", trustWeight: 0 };
  }

  const accountAge = Date.now() - viewer.walletCreatedAt.getTime();
  let trustWeight = 1;

  if (accountAge < DISCOVERY_CONFIG.sybil.newAccountAgeMs) {
    trustWeight *= 0.4;
    if (input.type === "save" || input.type === "follow") {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const engagementToday = await prisma.signalEvent.count({
        where: {
          viewerId: input.viewerId,
          type: { in: ["save", "follow"] },
          createdAt: { gte: dayAgo },
        },
      });
      if (
        engagementToday >=
        DISCOVERY_CONFIG.sybil.maxEngagementActionsNewAccountPerDay
      ) {
        return {
          allowed: false,
          reason: "new_account_engagement_cap",
          trustWeight: 0,
        };
      }
    }
  }

  if (viewer.flagged || viewer.washCluster) {
    return { allowed: false, reason: "viewer_flagged", trustWeight: 0 };
  }

  // Self-engagement on own listing is ignored for ranking weight.
  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
    select: { creatorId: true, uniqueViewers: true },
  });
  if (listing?.creatorId === input.viewerId) {
    if (input.type === "save" || input.type === "follow") {
      return { allowed: false, reason: "self_engagement", trustWeight: 0 };
    }
    trustWeight *= 0.1;
  }

  if (
    (input.type === "save" || input.type === "follow") &&
    (listing?.uniqueViewers ?? 0) <
      DISCOVERY_CONFIG.sybil.minUniqueViewersForSaveTrust
  ) {
    trustWeight *= 0.5;
  }

  return { allowed: true, trustWeight };
}

/**
 * Detect simple wash patterns: repeated buys between same buyer↔seller
 * with little authentic viewing history.
 */
export async function detectWashRisk(input: {
  buyerId: string;
  sellerId: string;
}): Promise<{ wash: boolean; reason?: string }> {
  if (input.buyerId === input.sellerId) {
    return { wash: true, reason: "self_purchase" };
  }

  const recentBuys = await prisma.purchase.count({
    where: {
      buyerId: input.buyerId,
      listing: { creatorId: input.sellerId },
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });

  if (recentBuys >= DISCOVERY_CONFIG.sybil.washPurchaseThreshold) {
    const views = await prisma.signalEvent.count({
      where: {
        viewerId: input.buyerId,
        creatorId: input.sellerId,
        type: { in: ["meaningful_view", "dwell"] },
      },
    });
    if (views < recentBuys) {
      return { wash: true, reason: "high_velocity_low_dwell" };
    }
  }

  return { wash: false };
}

export async function maybeFlagWashCluster(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { washCluster: true, flagged: true },
  });
}
