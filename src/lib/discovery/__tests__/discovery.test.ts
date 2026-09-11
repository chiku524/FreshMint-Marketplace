import { describe, expect, it } from "vitest";
import { buildSeedState } from "@/lib/data/seed";
import {
  DiscoveryEngine,
  DISCOVERY_CONFIG,
  applyEmergingQuota,
  canBecomeRisingEligible,
  canSoftLaunch,
  checkNewWalletCooldown,
  composeHomepageFeed,
  emergingShare,
  findNearDuplicate,
  getDailySlotBudgets,
  isEmergingCreator,
  measureFeedMix,
  planFeedMix,
  scoreListing,
  visibilityForStage,
} from "@/lib/discovery";
import type { RankedListing, SessionContext } from "@/lib/discovery/types";

const emptySession = (viewerId: string | null = null): SessionContext => ({
  viewerId,
  seenArtistIds: [],
  seenListingIds: [],
  seenCollectionIds: [],
  itemsOnCurrentScreen: [],
});

describe("Emerging eligibility", () => {
  it("uses a 90-day window and blocks flagged/wash", () => {
    const now = Date.now();
    const emerging = isEmergingCreator(
      {
        id: "a",
        displayName: "A",
        wallets: [],
        firstListingAt: now - 10 * 86400000,
        lifetimePrimaryVolumeUsd: 100,
        completedSales: 1,
        flagged: false,
        washCluster: false,
        verifiedCreator: false,
        walletCreatedAt: now - 40 * 86400000,
        risingEntriesThisWeek: 0,
        openLaneListingsToday: 0,
        curatorScore: 10,
        establishedBadge: false,
      },
      now,
    );
    expect(emerging.emerging).toBe(true);

    const flagged = isEmergingCreator(
      {
        id: "b",
        displayName: "B",
        wallets: [],
        firstListingAt: now,
        lifetimePrimaryVolumeUsd: 0,
        completedSales: 0,
        flagged: true,
        washCluster: false,
        verifiedCreator: false,
        walletCreatedAt: now,
        risingEntriesThisWeek: 0,
        openLaneListingsToday: 0,
        curatorScore: 0,
        establishedBadge: false,
      },
      now,
    );
    expect(flagged.emerging).toBe(false);
  });

  it("graduates high-volume established creators", () => {
    const now = Date.now();
    const result = isEmergingCreator(
      {
        id: "whale",
        displayName: "Whale",
        wallets: [],
        firstListingAt: now - 400 * 86400000,
        lifetimePrimaryVolumeUsd: 250_000,
        completedSales: 180,
        flagged: false,
        washCluster: false,
        verifiedCreator: true,
        walletCreatedAt: now - 800 * 86400000,
        risingEntriesThisWeek: 0,
        openLaneListingsToday: 0,
        curatorScore: 100,
        establishedBadge: true,
      },
      now,
    );
    expect(result.emerging).toBe(false);
  });
});

describe("Rising / Featured quotas", () => {
  it("reserves 40% of Rising slots for Emerging", () => {
    const budgets = getDailySlotBudgets();
    expect(budgets.risingTotal).toBe(DISCOVERY_CONFIG.risingSlotsPerDay);
    expect(budgets.risingEmergingReserved).toBe(
      Math.ceil(
        DISCOVERY_CONFIG.risingSlotsPerDay * DISCOVERY_CONFIG.emergingRisingQuota,
      ),
    );
    expect(DISCOVERY_CONFIG.emergingRisingQuota).toBe(0.4);
    expect(budgets.featuredTotal).toBe(12);
  });

  it("enforces emerging quota in applyEmergingQuota", () => {
    const state = buildSeedState();
    const engine = new DiscoveryEngine(state);
    const rising = engine.buildRising(emptySession());
    const share = emergingShare(rising);
    // With seed data, emerging should fill a healthy share of Rising.
    expect(share).toBeGreaterThanOrEqual(0.3);
    expect(rising.length).toBeLessThanOrEqual(
      DISCOVERY_CONFIG.risingSlotsPerDay,
    );

    // Synthetic quota fill
    const fake: RankedListing[] = [];
    const fresh = state.creators.get("artist-fresh")!;
    const whale = state.creators.get("artist-whale")!;
    for (let i = 0; i < 50; i++) {
      const emerging = i < 20;
      const creatorId = emerging ? `fresh-${i}` : `whale-${i}`;
      state.creators.set(creatorId, {
        ...(emerging ? fresh : whale),
        id: creatorId,
      });
      fake.push({
        listing: {
          ...state.listings.get("listing-fresh-1")!,
          id: `x-${i}`,
          creatorId,
        },
        score: 100 - i,
        bucket: "rising",
        emerging,
        reasons: [],
      });
    }
    const selected = applyEmergingQuota(fake, state.creators);
    const emergingCount = selected.filter((s) => s.emerging).length;
    expect(emergingCount).toBeGreaterThanOrEqual(
      getDailySlotBudgets().risingEmergingReserved,
    );
  });
});

describe("Feed mix", () => {
  it("plans 40/25/20/15 mix", () => {
    const plan = planFeedMix(20);
    expect(plan.counts.emerging_rising).toBe(8);
    expect(plan.counts.following).toBe(5);
    expect(plan.counts.featured).toBe(4);
    expect(plan.counts.auctions_live).toBe(3);
    expect(
      Object.values(plan.counts).reduce((a, b) => a + b, 0),
    ).toBe(20);
  });

  it("composes homepage without artist repeats on a page", () => {
    const state = buildSeedState();
    const engine = new DiscoveryEngine(state);
    const rising = engine.buildRising(emptySession());
    const featured = engine.buildFeatured(emptySession());
    const feed = composeHomepageFeed({
      listings: [...state.listings.values()],
      creators: state.creators,
      follows: state.follows.get("collector-mira"),
      shelves: [...state.shelves.values()],
      risingPool: rising,
      featuredPool: featured,
      session: emptySession("collector-mira"),
      pageSize: 12,
    });
    const artists = feed.map((f) => f.listing.creatorId);
    expect(new Set(artists).size).toBe(artists.length);
    const mix = measureFeedMix(feed);
    expect(mix.emerging_rising).toBeGreaterThan(0);
  });

  it("backfills empty Following with more Emerging Rising for guests", () => {
    const state = buildSeedState();
    const engine = new DiscoveryEngine(state);
    const rising = engine.buildRising(emptySession());
    const featured = engine.buildFeatured(emptySession());
    const feed = composeHomepageFeed({
      listings: [...state.listings.values()],
      creators: state.creators,
      follows: null,
      shelves: [],
      risingPool: rising,
      featuredPool: featured,
      session: emptySession(null),
      pageSize: 20,
    });
    const mix = measureFeedMix(feed);
    const plan = planFeedMix(20);
    expect(mix.emerging_rising).toBeGreaterThanOrEqual(
      plan.counts.emerging_rising / 20,
    );
    expect(feed.filter((item) => item.bucket === "following")).toHaveLength(0);
  });

  it("fills unused Following slots from leftover Emerging Rising", () => {
    const state = buildSeedState();
    const template = state.listings.get("listing-fresh-1")!;
    const risingPool: RankedListing[] = [];
    for (let i = 0; i < 16; i++) {
      const creatorId = `artist-guest-${i}`;
      state.creators.set(creatorId, {
        ...state.creators.get("artist-fresh")!,
        id: creatorId,
        displayName: creatorId,
        firstListingAt: Date.now() - 2 * 86400000,
        lifetimePrimaryVolumeUsd: 0,
        completedSales: 0,
      });
      risingPool.push({
        listing: {
          ...template,
          id: `guest-rising-${i}`,
          creatorId,
        },
        score: 20 - i,
        bucket: "rising",
        emerging: true,
        reasons: ["emerging"],
      });
    }
    const plan = planFeedMix(20);
    const feed = composeHomepageFeed({
      listings: risingPool.map((r) => r.listing),
      creators: state.creators,
      follows: null,
      shelves: [],
      risingPool,
      featuredPool: [],
      session: emptySession(null),
      pageSize: 20,
    });
    const emergingCount = feed.filter(
      (item) => item.bucket === "emerging_rising",
    ).length;
    expect(emergingCount).toBeGreaterThan(plan.counts.emerging_rising);
    expect(feed.filter((item) => item.bucket === "following")).toHaveLength(0);
    expect(feed.length).toBeGreaterThan(plan.counts.emerging_rising);
  });
});

describe("Listing stages", () => {
  it("gates draft → soft → rising → featured", () => {
    const state = buildSeedState();
    const listing = state.listings.get("listing-fresh-1")!;
    const draft = {
      ...listing,
      stage: "draft" as const,
      softLaunchedAt: null,
      tokenId: "1",
      contractAddress: "0x1111111111111111111111111111111111111111",
      mintTxHash: "0xminted",
    };
    expect(canSoftLaunch(draft).ok).toBe(true);
    expect(
      canSoftLaunch({
        ...draft,
        tokenId: null,
        contractAddress: null,
        mintTxHash: null,
      }).ok,
    ).toBe(false);
    expect(visibilityForStage("draft").openLane).toBe(false);
    expect(visibilityForStage("soft_launch").openLane).toBe(true);
    expect(visibilityForStage("rising_eligible").rising).toBe(true);
    expect(visibilityForStage("featured").featured).toBe(true);

    const creator = state.creators.get("artist-fresh")!;
    const soft = { ...draft, stage: "soft_launch" as const };
    expect(canBecomeRisingEligible(soft, creator).ok).toBe(true);

    const engine = new DiscoveryEngine(state);
    engine.state.listings.set(draft.id, draft);
    const auto = engine.transitionListing(draft.id, "soft_launch");
    expect(auto.ok).toBe(true);
    expect(auto.listing?.stage).toBe("rising_eligible");
  });
});

describe("Anti-spam", () => {
  it("detects duplicate media and enforces new-wallet cooldown", () => {
    const state = buildSeedState();
    const existing = [...state.listings.values()];
    const dup = findNearDuplicate("a1b2c3d4e5f60718", existing);
    expect(dup.isDuplicate).toBe(true);

    const now = Date.now();
    const freshWallet = {
      ...state.creators.get("artist-fresh")!,
      walletCreatedAt: now - 1000,
    };
    expect(checkNewWalletCooldown(freshWallet, now).allowed).toBe(false);
    expect(
      checkNewWalletCooldown(freshWallet, now, { firstRisingLook: true }).allowed,
    ).toBe(true);
  });

  it("delists under report pressure", () => {
    const engine = new DiscoveryEngine(buildSeedState());
    const r1 = engine.reportListing({
      id: "r1",
      listingId: "listing-fresh-1",
      reporterId: "collector-mira",
      reason: "stolen_art",
    });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.delisted).toBe(true);
  });
});

describe("Scoring & metrics", () => {
  it("scores with novelty and decays over-impressed works", () => {
    const state = buildSeedState();
    const listing = state.listings.get("listing-whale-featured")!;
    const creator = state.creators.get("artist-whale")!;
    const scored = scoreListing(listing, creator, emptySession());
    expect(scored.decay).toBeLessThan(1);
    expect(scored.emerging).toBe(false);
  });

  it("tracks emerging impression share and entropy", () => {
    const engine = new DiscoveryEngine(buildSeedState());
    engine.buildHomepage("collector-mira", 16);
    const snap = engine.metrics.snapshot();
    expect(snap.impressions).toBeGreaterThan(0);
    expect(snap.emergingImpressionShare).toBeGreaterThan(0);
    expect(snap.feedEntropy).toBeGreaterThan(0);
  });
});
