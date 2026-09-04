import { describe, expect, it } from "vitest";
import { buildSeedState } from "@/lib/data/seed";
import {
  DISCOVERY_CONFIG,
  DiscoveryEngine,
  applyEmergingQuota,
  computeQualitySignal,
  computeRisingAgeBoost,
  computeTasteAffinity,
  discoveryWeightForType,
  evaluateDiscoveryPolicy,
  expandFollowGraph,
  getDailySlotBudgets,
  isEmergingCreator,
  retrieveRisingCandidates,
  scoreListing,
} from "@/lib/discovery";
import type { CreatorProfile, Listing, RankedListing } from "@/lib/discovery/types";
import { emptySession } from "@/lib/discovery/viewer-session";

function creator(partial: Partial<CreatorProfile> & { id: string }): CreatorProfile {
  const now = Date.now();
  return {
    displayName: partial.id,
    wallets: [],
    firstListingAt: now,
    lifetimePrimaryVolumeUsd: 0,
    completedSales: 0,
    flagged: false,
    washCluster: false,
    verifiedCreator: false,
    walletCreatedAt: now - 40 * 86400000,
    risingEntriesThisWeek: 0,
    openLaneListingsToday: 0,
    curatorScore: 10,
    establishedBadge: false,
    ...partial,
  };
}

describe("Emerging two-of-three graduation", () => {
  const now = Date.now();

  it("graduates when two thresholds are exceeded", () => {
    const highSalesLowVolume = isEmergingCreator(
      creator({
        id: "camp",
        lifetimePrimaryVolumeUsd: 3_920,
        completedSales: 80,
        firstListingAt: now - 400 * 86400000,
      }),
      now,
    );
    expect(highSalesLowVolume.emerging).toBe(false);
    expect(highSalesLowVolume.exceededCount).toBe(2);

    const newButTraction = isEmergingCreator(
      creator({
        id: "fast",
        lifetimePrimaryVolumeUsd: 6_000,
        completedSales: 12,
        firstListingAt: now - 30 * 86400000,
      }),
      now,
    );
    expect(newButTraction.emerging).toBe(false);
  });

  it("stays Emerging when only one threshold is exceeded", () => {
    const result = isEmergingCreator(
      creator({
        id: "slow",
        lifetimePrimaryVolumeUsd: 4_999,
        completedSales: 9,
        firstListingAt: now - 400 * 86400000,
      }),
      now,
    );
    expect(result.emerging).toBe(true);
    expect(result.exceededCount).toBe(1);
  });
});

describe("Rate-based quality", () => {
  it("prefers high-rate attention over raw popularity", () => {
    const popular: Listing = {
      ...buildSeedState().listings.get("listing-fresh-1")!,
      id: "popular",
      signals: {
        saves: 12,
        follows: 4,
        dwellMsTotal: 40_000,
        uniqueViewers: 2_000,
        impressionsToday: 8_000,
        impressionsThisWeek: 10_000,
        reportRate: 0,
        nominationScore: 1,
      },
    };
    const intimate: Listing = {
      ...popular,
      id: "intimate",
      signals: {
        ...popular.signals,
        saves: 8,
        follows: 3,
        dwellMsTotal: 30_000,
        uniqueViewers: 50,
        impressionsToday: 80,
        impressionsThisWeek: 80,
      },
    };
    expect(computeQualitySignal(intimate)).toBeGreaterThan(
      computeQualitySignal(popular),
    );
  });

  it("discounts saves before unique-viewer trust", () => {
    const untrusted: Listing = {
      ...buildSeedState().listings.get("listing-fresh-1")!,
      signals: {
        saves: 6,
        follows: 4,
        dwellMsTotal: 3_000,
        uniqueViewers: 1,
        impressionsToday: 6,
        impressionsThisWeek: 6,
        reportRate: 0,
        nominationScore: 0,
      },
    };
    const trusted = {
      ...untrusted,
      signals: { ...untrusted.signals, uniqueViewers: 12 },
    };
    expect(computeQualitySignal(trusted)).toBeGreaterThan(
      computeQualitySignal(untrusted),
    );
  });
});

describe("Rising explore + featured dominance", () => {
  it("reserves an explore slice for low-exposure Emerging", () => {
    const state = buildSeedState();
    const fake: RankedListing[] = [];
    for (let i = 0; i < 40; i++) {
      fake.push({
        listing: {
          ...state.listings.get("listing-fresh-1")!,
          id: `e-${i}`,
          creatorId: "artist-fresh",
          signals: {
            ...state.listings.get("listing-fresh-1")!.signals,
            impressionsThisWeek: i < 20 ? 800 : 0,
          },
        },
        score: 50 - i,
        bucket: "rising",
        emerging: true,
        reasons: [],
      });
    }
    const selected = applyEmergingQuota(fake, state.creators);
    const explore = selected.filter((s) => s.reasons.includes("explore"));
    expect(explore.length).toBe(getDailySlotBudgets().risingExplore);
    expect(explore.every((s) => s.listing.signals.impressionsThisWeek === 0)).toBe(
      true,
    );
  });

  it("keeps live Featured creators off Rising", () => {
    const rising = new DiscoveryEngine(buildSeedState()).buildRising();
    expect(rising.some((r) => r.listing.creatorId === "artist-whale")).toBe(false);
    expect(rising.some((r) => r.listing.creatorId === "artist-fresh")).toBe(true);
  });
});

describe("Type weights, rising age, retrieve", () => {
  it("weights singles above collections", () => {
    expect(discoveryWeightForType("single")).toBeGreaterThan(
      discoveryWeightForType("collection"),
    );
  });

  it("bursts newly Rising singles then decays", () => {
    const listing = buildSeedState().listings.get("listing-fresh-1")!;
    const now = Date.now();
    const fresh = computeRisingAgeBoost(
      { ...listing, type: "single", risingEligibleAt: now - 60 * 60 * 1000 },
      now,
    );
    const aged = computeRisingAgeBoost(
      { ...listing, type: "single", risingEligibleAt: now - 20 * 86400000 },
      now,
    );
    expect(fresh).toBeGreaterThan(aged);
  });

  it("retrieves only Rising-visible listings", () => {
    const state = buildSeedState();
    const retrieved = retrieveRisingCandidates(state.listings.values());
    expect(retrieved.every((l) => l.stage !== "soft_launch")).toBe(true);
    expect(retrieved.every((l) => l.stage !== "draft")).toBe(true);
  });
});

describe("Taste, collector graph, unique viewers", () => {
  it("boosts Emerging works that match taste tags", () => {
    const nova = buildSeedState().listings.get("listing-nova-1")!;
    const glitch = buildSeedState().listings.get("listing-glitch-oe")!;
    const taste = { styleTags: ["ink"] };
    expect(computeTasteAffinity(nova, taste)).toBeGreaterThan(
      computeTasteAffinity(glitch, taste),
    );
  });

  it("expands Following through followed collectors", () => {
    const state = buildSeedState();
    const expanded = expandFollowGraph(
      state.follows.get("collector-mira"),
      state.follows,
    );
    expect(expanded.artistIds.has("artist-glitch")).toBe(true);
    expect(expanded.artistIds.has("artist-nova")).toBe(true);
  });

  it("counts unique viewers once per viewer × listing", () => {
    const engine = new DiscoveryEngine(buildSeedState());
    engine.recordView({
      listingId: "listing-fresh-1",
      viewerId: "collector-mira",
      dwellMs: 4_000,
    });
    engine.recordView({
      listingId: "listing-fresh-1",
      viewerId: "collector-mira",
      dwellMs: 4_000,
    });
    const after = engine.state.listings.get("listing-fresh-1")!;
    expect(after.signals.uniqueViewers).toBe(
      buildSeedState().listings.get("listing-fresh-1")!.signals.uniqueViewers + 1,
    );
  });
});

describe("Session diversity + policy", () => {
  it("downranks artists already seen this session", () => {
    const state = buildSeedState();
    const listing = state.listings.get("listing-fresh-1")!;
    const creator = state.creators.get("artist-fresh")!;
    const unseen = scoreListing(listing, creator, emptySession());
    const seen = scoreListing(listing, creator, {
      ...emptySession(),
      seenArtistIds: ["artist-fresh"],
    });
    expect(seen.score).toBeLessThan(unseen.score);
    expect(seen.reasons).toContain("diversity_penalty");
  });

  it("recommends explore when Emerging impressions do not convert", () => {
    const report = evaluateDiscoveryPolicy({
      impressions: 200,
      emergingImpressions: 120,
      emergingImpressionShare: 0.6,
      firstPurchases: 10,
      emergingFirstPurchases: 0,
      emergingFirstPurchaseShare: 0,
      meaningfulViews: 40,
      reports: 1,
      duplicatesBlocked: 0,
      risingAbuse: 0,
      spamRate: 0.01,
      feedEntropy: 3,
      avgTimeToFirstMeaningfulViewMs: 1_000,
      collectorEmergingBuyers: 0,
      collectorEmergingBuyerRetentionProxy: 0,
    });
    expect(report.recommendations.some((r) => r.action === "increase_explore")).toBe(
      true,
    );
  });
});

describe("Locked explore budget", () => {
  it("keeps explore at ~12% of Rising", () => {
    const budgets = getDailySlotBudgets();
    expect(DISCOVERY_CONFIG.exploreRisingShare).toBe(0.12);
    expect(budgets.risingExplore).toBe(
      Math.max(1, Math.floor(DISCOVERY_CONFIG.risingSlotsPerDay * 0.12)),
    );
    expect(
      budgets.risingEmergingReserved + budgets.risingExplore,
    ).toBeLessThanOrEqual(budgets.risingTotal);
  });
});
