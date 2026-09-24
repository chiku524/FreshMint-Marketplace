import { beforeEach, describe, expect, it } from "vitest";
import { enableMemoryMode, resetMemoryStoreForTests } from "@/lib/data/memory-store";
import {
  countUnreadNotifications,
  createNotification,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
  notificationDedupeKey,
} from "@/lib/notifications";
import {
  notifyEnglishWin,
  notifyEnglishExpired,
} from "@/lib/notifications/emit";
import { assertCronAuthorized } from "@/lib/marketplace/settle-cron";
import {
  ENGLISH_WINNER_PAYMENT_DEADLINE_MS,
} from "@/lib/marketplace/lifecycle";

describe("notification idempotency", () => {
  beforeEach(() => {
    resetMemoryStoreForTests();
    enableMemoryMode("test");
  });

  it("does not duplicate on same dedupeKey", async () => {
    const key = notificationDedupeKey("english_win", "listing-1", "purchase-1");
    const a = await createNotification({
      userId: "u1",
      type: "english_win",
      title: "You won",
      dedupeKey: key,
      now: 1_000,
    });
    const b = await createNotification({
      userId: "u1",
      type: "english_win",
      title: "You won again",
      dedupeKey: key,
      now: 2_000,
    });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.notification?.id).toBe(a.notification?.id);
    const listed = await listNotificationsForUser({ userId: "u1" });
    expect(listed.items).toHaveLength(1);
  });

  it("emit helpers stay idempotent across repeated settles", async () => {
    const first = await notifyEnglishWin({
      winnerId: "winner",
      listingId: "L1",
      listingTitle: "Ink",
      purchaseId: "P1",
      amountUsd: 40,
      awardedAt: 1_700_000_000_000,
    });
    const second = await notifyEnglishWin({
      winnerId: "winner",
      listingId: "L1",
      listingTitle: "Ink",
      purchaseId: "P1",
      amountUsd: 40,
      awardedAt: 1_700_000_000_000,
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(first.notification?.payloadJson).toContain(
      String(1_700_000_000_000 + ENGLISH_WINNER_PAYMENT_DEADLINE_MS),
    );

    const expired = await notifyEnglishExpired({
      winnerId: "winner",
      listingId: "L1",
      purchaseId: "P1",
      amountUsd: 40,
    });
    const expired2 = await notifyEnglishExpired({
      winnerId: "winner",
      listingId: "L1",
      purchaseId: "P1",
      amountUsd: 40,
    });
    expect(expired.created).toBe(true);
    expect(expired2.created).toBe(false);
  });

  it("supports unread count and mark read / mark all", async () => {
    await createNotification({
      userId: "u1",
      type: "item_sold",
      title: "Sold A",
      dedupeKey: "item_sold:a",
      now: 1,
    });
    await createNotification({
      userId: "u1",
      type: "item_sold",
      title: "Sold B",
      dedupeKey: "item_sold:b",
      now: 2,
    });
    expect(await countUnreadNotifications("u1")).toBe(2);
    const listed = await listNotificationsForUser({ userId: "u1", limit: 10 });
    await markNotificationRead({
      userId: "u1",
      notificationId: listed.items[0]!.id,
      now: 10,
    });
    expect(await countUnreadNotifications("u1")).toBe(1);
    const all = await markAllNotificationsRead({ userId: "u1", now: 11 });
    expect(all.updated).toBe(1);
    expect(await countUnreadNotifications("u1")).toBe(0);
  });
});

describe("cron auth", () => {
  it("rejects missing/wrong bearer and accepts matching CRON_SECRET", () => {
    const prev = process.env.CRON_SECRET;
    try {
      delete process.env.CRON_SECRET;
      expect(assertCronAuthorized({ headers: { get: () => null } })).toEqual({
        ok: false,
        error: "cron_secret_not_configured",
        status: 503,
      });

      process.env.CRON_SECRET = "test-secret";
      expect(
        assertCronAuthorized({
          headers: { get: () => "Bearer nope" },
        }),
      ).toEqual({ ok: false, error: "unauthorized", status: 401 });

      expect(
        assertCronAuthorized({
          headers: { get: () => "Bearer test-secret" },
        }),
      ).toEqual({ ok: true });
    } finally {
      if (prev == null) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  });
});

describe("settle batch helper", () => {
  beforeEach(() => {
    resetMemoryStoreForTests();
    enableMemoryMode("test");
  });

  it("scans ended english listings in memory without throwing", async () => {
    const { getMemoryEngine } = await import("@/lib/data/memory-store");
    const { settleEndedEnglishAuctions } = await import(
      "@/lib/marketplace/settle-cron"
    );
    const engine = getMemoryEngine();
    const now = 10_000;
    engine.state.listings.set("eng-ended", {
      ...(engine.state.listings.values().next().value as object),
      id: "eng-ended",
      creatorId: "creator-1",
      type: "auction",
      saleMode: "english",
      delisted: false,
      title: "Ended English",
      priceUsd: 10,
      startingBidUsd: 10,
      reserveUsd: 5,
      currentHighBidUsd: 20,
      highBidderId: "bidder-1",
      auctionStartsAt: 1,
      auctionEndsAt: 5_000,
      chain: "evm",
      network: "ethereum",
      stage: "soft_launch",
      medium: "digital",
      styleTags: [],
      mediaHash: "h",
      mediaUrl: null,
      metadataComplete: true,
      originalMedia: true,
      createdAt: 1,
      softLaunchedAt: 1,
      risingEligibleAt: null,
      featuredAt: null,
      featuredBoostedAt: null,
      oeStartsAt: null,
      oeEndsAt: null,
      collectionId: null,
      isCollectionHero: false,
      traits: [],
      maxSupply: 1,
      appealStatus: "none",
      mintTxHash: "0xm",
      contractAddress: "0xc",
      tokenId: "1",
      signals: {
        saves: 0,
        follows: 0,
        dwellMsTotal: 0,
        uniqueViewers: 0,
        impressionsToday: 0,
        impressionsThisWeek: 0,
        pageViews: 0,
        reportRate: 0,
        nominationScore: 0,
      },
    } as never);

    // Ensure bidder exists for award
    engine.state.creators.set("bidder-1", {
      id: "bidder-1",
      displayName: "Bidder",
      wallets: [],
      firstListingAt: null,
      lifetimePrimaryVolumeUsd: 0,
      completedSales: 0,
      flagged: false,
      washCluster: false,
      verifiedCreator: false,
      walletCreatedAt: 1,
      risingEntriesThisWeek: 0,
      openLaneListingsToday: 0,
      curatorScore: 20,
      establishedBadge: false,
    });
    engine.state.creators.set("creator-1", {
      id: "creator-1",
      displayName: "Creator",
      wallets: [],
      firstListingAt: null,
      lifetimePrimaryVolumeUsd: 0,
      completedSales: 0,
      flagged: false,
      washCluster: false,
      verifiedCreator: false,
      walletCreatedAt: 1,
      risingEntriesThisWeek: 0,
      openLaneListingsToday: 0,
      curatorScore: 20,
      establishedBadge: false,
    });

    const result = await settleEndedEnglishAuctions({ now, limit: 20 });
    expect(result.scanned).toBeGreaterThanOrEqual(1);
    expect(result.errors).toEqual([]);
    // Second pass should still be safe (idempotent notifies / awards)
    const again = await settleEndedEnglishAuctions({ now, limit: 20 });
    expect(again.errors).toEqual([]);
    expect(await countUnreadNotifications("bidder-1")).toBeGreaterThanOrEqual(1);
    expect(await countUnreadNotifications("creator-1")).toBeGreaterThanOrEqual(1);
    // Idempotent: count should not grow on second settle for same award
    const unreadWinner = await countUnreadNotifications("bidder-1");
    await settleEndedEnglishAuctions({ now, limit: 20 });
    expect(await countUnreadNotifications("bidder-1")).toBe(unreadWinner);
  });
});
