import { DISCOVERY_CONFIG } from "@/lib/discovery/config";
import { prisma } from "@/lib/db";

export interface SybilCheckResult {
  allowed: boolean;
  reason?: string;
  trustWeight: number;
}

async function usingMemory(): Promise<boolean> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  return mode === "memory" || isMemoryMode();
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
    if (input.type === "save" || input.type === "follow") {
      return { allowed: false, reason: "login_required", trustWeight: 0 };
    }
    return { allowed: true, trustWeight: 0.35 };
  }

  if (await usingMemory()) {
    const { getMemoryEngine } = await import("@/lib/data/memory-store");
    const engine = getMemoryEngine();
    const listing = engine.state.listings.get(input.listingId);
    const viewer = engine.state.creators.get(input.viewerId);
    if (!listing || !viewer) {
      return { allowed: false, reason: "viewer_missing", trustWeight: 0 };
    }
    if (viewer.flagged || viewer.washCluster) {
      return { allowed: false, reason: "viewer_flagged", trustWeight: 0 };
    }
    if (listing.creatorId === input.viewerId) {
      if (input.type === "save" || input.type === "follow") {
        return { allowed: false, reason: "self_engagement", trustWeight: 0 };
      }
      return { allowed: true, trustWeight: 0.1 };
    }
    const accountAge = Date.now() - viewer.walletCreatedAt;
    let trustWeight = accountAge < DISCOVERY_CONFIG.sybil.newAccountAgeMs ? 0.4 : 1;
    return { allowed: true, trustWeight };
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

  if (await usingMemory()) {
    return { wash: false };
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
  if (await usingMemory()) {
    const { getMemoryState } = await import("@/lib/data/memory-store");
    const creator = getMemoryState().creators.get(userId);
    if (creator) {
      creator.washCluster = true;
      creator.flagged = true;
    }
    return;
  }
  await prisma.user.update({
    where: { id: userId },
    data: { washCluster: true, flagged: true },
  });
}
