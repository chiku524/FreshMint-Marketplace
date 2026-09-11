import { describe, expect, it } from "vitest";
import { buildSeedState } from "@/lib/data/seed";
import {
  DISCOVERY_CONFIG,
  DiscoveryEngine,
  applyEmergingQuota,
  computeFirstLookBoost,
  computeQualitySignal,
  computeRisingAgeBoost,
  computeSoftLaunchRecencyBoost,
  computeSpamRiskInverse,
  computeTasteAffinity,
  discoveryWeightForType,
  evaluateDiscoveryPolicy,
  expandFollowGraph,
  getDailySlotBudgets,
  isEmergingCreator,
  isFirstRisingLook,
  refreshCreatorPeriodCounters,
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

describe("Emerging window + early commercial graduation", () => {
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

  it("stays Emerging when only one commercial threshold is exceeded inside the window", () => {
    const result = isEmergingCreator(
      creator({
        id: "slow",
        lifetimePrimaryVolumeUsd: 4_999,
        completedSales: 9,
        firstListingAt: now - 40 * 86400000,
      }),
      now,
    );
    expect(result.emerging).toBe(true);
    expect(result.exceededCount).toBe(0);
  });

  it("graduates when the 90-day window closes even without sales", () => {
    const result = isEmergingCreator(
      creator({
        id: "camper",
        lifetimePrimaryVolumeUsd: 4_999,
        completedSales: 9,
        firstListingAt: now - 400 * 86400000,
      }),
      now,
    );
    expect(result.emerging).toBe(false);
    expect(result.reasons).toContain("graduated_tenure_window");
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
        pageViews: 80,
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
        pageViews: 18,
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
        pageViews: 0,
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

  it("prefers listing-page opens over scroll-only impressions", () => {
    const base: Listing = {
      ...buildSeedState().listings.get("listing-fresh-1")!,
      signals: {
        saves: 2,
        follows: 1,
        dwellMsTotal: 12_000,
        uniqueViewers: 40,
        impressionsToday: 200,
        impressionsThisWeek: 200,
        pageViews: 4,
        reportRate: 0,
        nominationScore: 0,
      },
    };
    const opened = {
      ...base,
      signals: { ...base.signals, pageViews: 48 },
    };
    expect(computeQualitySignal(opened)).toBeGreaterThan(
      computeQualitySignal(base),
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

  it("lifts brand-new Open Lane work over aged listings", () => {
    const listing = buildSeedState().listings.get("listing-fresh-1")!;
    const now = Date.now();
    const fresh = computeSoftLaunchRecencyBoost(
      { ...listing, softLaunchedAt: now - 2 * 60 * 60 * 1000 },
      now,
    );
    const aged = computeSoftLaunchRecencyBoost(
      { ...listing, softLaunchedAt: now - 10 * 86400000 },
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

  it("rolls Rising weekly caps from listing timestamps", () => {
    const state = buildSeedState();
    const creator = state.creators.get("artist-fresh")!;
    creator.risingEntriesThisWeek = 99;
    for (const listing of state.listings.values()) {
      if (listing.creatorId !== creator.id) continue;
      if (listing.risingEligibleAt != null) {
        listing.risingEligibleAt = Date.now() - 20 * 86400000;
      }
    }
    refreshCreatorPeriodCounters(creator, state.listings.values());
    expect(creator.risingEntriesThisWeek).toBe(0);
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

describe("First-look path for new artists", () => {
  it("treats a creator with no prior Rising work as a first look", () => {
    const state = buildSeedState();
    expect(isFirstRisingLook("artist-unknown", state.listings.values())).toBe(
      true,
    );
    expect(isFirstRisingLook("artist-fresh", state.listings.values())).toBe(
      false,
    );
  });

  it("lets a new artist's first work skip the wallet cooldown", () => {
    const state = buildSeedState();
    const now = Date.now();
    const creator = {
      ...state.creators.get("artist-fresh")!,
      id: "artist-debut",
      walletCreatedAt: now - 1000,
      firstListingAt: now,
      risingEntriesThisWeek: 0,
    };
    state.creators.set(creator.id, creator);
    const listing = {
      ...state.listings.get("listing-fresh-1")!,
      id: "listing-debut",
      creatorId: creator.id,
      stage: "soft_launch" as const,
      risingEligibleAt: null,
    };
    state.listings.set(listing.id, listing);
    const engine = new DiscoveryEngine(state);
    const result = engine.transitionListing(listing.id, "rising_eligible", now);
    expect(result.ok).toBe(true);
    expect(result.listing?.stage).toBe("rising_eligible");

    const second = {
      ...listing,
      id: "listing-debut-2",
      stage: "soft_launch" as const,
      risingEligibleAt: null,
    };
    state.listings.set(second.id, second);
    const blocked = engine.transitionListing(second.id, "rising_eligible", now);
    expect(blocked.ok).toBe(false);
    expect(blocked.errors).toContain("new_wallet_cooldown");
  });

  it("boosts never-shown Emerging over the same work after impressions", () => {
    const state = buildSeedState();
    const listing = state.listings.get("listing-fresh-1")!;
    const creator = state.creators.get("artist-fresh")!;
    const unseen = computeFirstLookBoost(
      { ...listing, signals: { ...listing.signals, impressionsThisWeek: 0 } },
      creator,
    );
    const seen = computeFirstLookBoost(
      { ...listing, signals: { ...listing.signals, impressionsThisWeek: 80 } },
      creator,
    );
    expect(unseen).toBeGreaterThan(seen);
    expect(unseen).toBe(DISCOVERY_CONFIG.firstLook.neverShownBoost);
  });

  it("does not crush clean Emerging new wallets on spam risk", () => {
    const state = buildSeedState();
    const listing = state.listings.get("listing-fresh-1")!;
    const young = {
      ...state.creators.get("artist-fresh")!,
      walletCreatedAt: Date.now() - 60 * 60 * 1000,
    };
    expect(computeSpamRiskInverse(listing, young)).toBeGreaterThan(0.7);
  });

  it("fills explore from the never-shown pool even when reserved would consume it", () => {
    const state = buildSeedState();
    const fake: RankedListing[] = [];
    for (let i = 0; i < 8; i++) {
      fake.push({
        listing: {
          ...state.listings.get("listing-fresh-1")!,
          id: `tiny-${i}`,
          creatorId: "artist-fresh",
          signals: {
            ...state.listings.get("listing-fresh-1")!.signals,
            impressionsThisWeek: i === 0 ? 0 : 400 + i,
          },
        },
        score: i === 0 ? 1 : 40 - i,
        bucket: "rising",
        emerging: true,
        reasons: [],
      });
    }
    const selected = applyEmergingQuota(fake, state.creators);
    const explore = selected.filter((s) => s.reasons.includes("explore"));
    expect(explore.length).toBeGreaterThan(0);
    expect(explore.some((s) => s.listing.id === "tiny-0")).toBe(true);
  });
});
