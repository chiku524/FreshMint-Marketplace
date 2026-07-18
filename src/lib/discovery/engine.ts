import {
  checkNewWalletCooldown,
  checkOpenLaneRateLimit,
  checkRisingRateLimit,
  findNearDuplicate,
  nominateListing,
  applyReportPressure,
  createReport,
  submitAppeal,
  resolveAppeal,
  validateListingQuality,
} from "./anti-spam";
import { DISCOVERY_CONFIG } from "./config";
import { isEmergingCreator, isEmergingListing } from "./emerging";
import { composeHomepageFeed, filterOpenLane } from "./feed-mix";
import { MetricsCollector, isMeaningfulView } from "./metrics";
import {
  applyEmergingQuota,
  capConcurrentOpenEditions,
  getDailySlotBudgets,
  selectFeaturedSlots,
  selectLiveAuctionStrip,
} from "./quotas";
import { scoreListing } from "./scoring";
import {
  advanceStage,
  collectionFeedSurface,
  visibilityForStage,
} from "./staging";
import type {
  Appeal,
  CreatorProfile,
  FollowGraph,
  Listing,
  RankedListing,
  Report,
  ReportReason,
  SessionContext,
  Shelf,
  Collection,
} from "./types";

export interface MarketplaceState {
  creators: Map<string, CreatorProfile>;
  listings: Map<string, Listing>;
  collections: Map<string, Collection>;
  shelves: Map<string, Shelf>;
  follows: Map<string, FollowGraph>;
  reports: Report[];
  appeals: Appeal[];
}

export class DiscoveryEngine {
  readonly metrics = new MetricsCollector();

  constructor(public state: MarketplaceState) {}

  getBudgets() {
    return getDailySlotBudgets();
  }

  getConfig() {
    return DISCOVERY_CONFIG;
  }

  emergingStatus(creatorId: string, now = Date.now()) {
    const creator = this.state.creators.get(creatorId);
    if (!creator) return null;
    return isEmergingCreator(creator, now);
  }

  private emptySession(viewerId: string | null = null): SessionContext {
    return {
      viewerId,
      seenArtistIds: [],
      seenListingIds: [],
      seenCollectionIds: [],
      itemsOnCurrentScreen: [],
    };
  }

  buildRising(
    session: SessionContext = this.emptySession(),
    now = Date.now(),
  ): RankedListing[] {
    const candidates: RankedListing[] = [];
    for (const listing of this.state.listings.values()) {
      const vis = visibilityForStage(listing.stage);
      if (!vis.rising || listing.delisted) continue;
      const creator = this.state.creators.get(listing.creatorId);
      if (!creator) continue;
      const breakdown = scoreListing(listing, creator, session, now);
      candidates.push({
        listing,
        score: breakdown.score,
        bucket: "rising",
        emerging: breakdown.emerging,
        reasons: breakdown.reasons,
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    const capped = capConcurrentOpenEditions(candidates, now);
    return applyEmergingQuota(capped, this.state.creators, now);
  }

  buildFeatured(
    session: SessionContext = this.emptySession(),
    now = Date.now(),
  ): RankedListing[] {
    const candidates: RankedListing[] = [];
    for (const listing of this.state.listings.values()) {
      const vis = visibilityForStage(listing.stage);
      if (!vis.featured && listing.stage !== "featured_eligible") continue;
      if (listing.delisted) continue;
      const creator = this.state.creators.get(listing.creatorId);
      if (!creator) continue;
      const breakdown = scoreListing(listing, creator, session, now);
      candidates.push({
        listing,
        score: breakdown.score,
        bucket: "featured",
        emerging: breakdown.emerging,
        reasons: breakdown.reasons,
      });
    }
    return selectFeaturedSlots(candidates);
  }

  buildOpenLane(filters: Parameters<typeof filterOpenLane>[1] = {}) {
    return filterOpenLane([...this.state.listings.values()], filters);
  }

  buildHomepage(viewerId: string | null = null, pageSize = 20, now = Date.now()) {
    const session = this.emptySession(viewerId);
    const rising = this.buildRising(session, now);
    const featured = this.buildFeatured(session, now);
    const follows = viewerId ? this.state.follows.get(viewerId) ?? null : null;
    const feed = composeHomepageFeed({
      listings: [...this.state.listings.values()],
      creators: this.state.creators,
      follows,
      shelves: [...this.state.shelves.values()],
      risingPool: rising,
      featuredPool: featured,
      session,
      pageSize,
      now,
    });
    this.metrics.recordFeedImpressions(feed, viewerId ?? undefined, now);
    return {
      feed,
      rising,
      featured,
      liveAuctions: selectLiveAuctionStrip([...this.state.listings.values()], now),
      budgets: this.getBudgets(),
      mix: DISCOVERY_CONFIG.feedMix,
    };
  }

  createListing(
    listing: Listing,
    options: { skipDuplicateCheck?: boolean } = {},
  ): { ok: boolean; errors: string[]; listing?: Listing } {
    const creator = this.state.creators.get(listing.creatorId);
    if (!creator) return { ok: false, errors: ["creator_not_found"] };

    const qualityErrors = validateListingQuality(listing);
    if (qualityErrors.length) return { ok: false, errors: qualityErrors };

    const openLimit = checkOpenLaneRateLimit(creator);
    if (listing.stage !== "draft" && !openLimit.allowed) {
      return { ok: false, errors: [openLimit.reason ?? "rate_limited"] };
    }

    if (!options.skipDuplicateCheck) {
      const dup = findNearDuplicate(listing.mediaHash, [
        ...this.state.listings.values(),
      ]);
      if (dup.isDuplicate) {
        this.metrics.record({
          type: "duplicate_blocked",
          listingId: dup.matchedListingId,
          creatorId: listing.creatorId,
          timestamp: Date.now(),
          meta: { distance: dup.distance },
        });
        return {
          ok: false,
          errors: [`duplicate_media:${dup.matchedListingId}`],
        };
      }
    }

    this.state.listings.set(listing.id, listing);
    if (creator.firstListingAt == null) {
      creator.firstListingAt = listing.createdAt;
      this.metrics.registerCreatorFirstListing(creator.id, listing.createdAt);
    }
    if (listing.stage !== "draft") {
      creator.openLaneListingsToday += 1;
    }
    return { ok: true, errors: [], listing };
  }

  transitionListing(listingId: string, target: Listing["stage"], now = Date.now()) {
    const listing = this.state.listings.get(listingId);
    if (!listing) return { ok: false, errors: ["not_found"] as string[] };
    const creator = this.state.creators.get(listing.creatorId);
    if (!creator) return { ok: false, errors: ["creator_not_found"] as string[] };

    if (target === "rising_eligible") {
      const cooldown = checkNewWalletCooldown(creator, now);
      if (!cooldown.allowed) {
        return { ok: false, errors: [cooldown.reason ?? "cooldown"] };
      }
      const risingCap = checkRisingRateLimit(creator);
      if (!risingCap.allowed) {
        this.metrics.record({
          type: "rising_abuse",
          listingId,
          creatorId: creator.id,
          timestamp: now,
        });
        return { ok: false, errors: [risingCap.reason ?? "rising_cap"] };
      }
    }

    const { listing: updated, result } = advanceStage(
      listing,
      creator,
      target,
      now,
    );
    if (!result.ok) return { ok: false, errors: result.errors };

    this.state.listings.set(listingId, updated);
    if (target === "rising_eligible") {
      creator.risingEntriesThisWeek += 1;
    }
    return { ok: true, errors: [] as string[], listing: updated };
  }

  reportListing(input: {
    id: string;
    listingId: string;
    reporterId: string;
    reason: ReportReason;
  }) {
    const listing = this.state.listings.get(input.listingId);
    if (!listing) return { ok: false as const, error: "not_found" };
    const report = createReport(input);
    this.state.reports.push(report);
    const { listing: updated, delisted, reason } = applyReportPressure(
      listing,
      this.state.reports,
    );
    this.state.listings.set(listing.id, updated);
    this.metrics.record({
      type: "report",
      listingId: listing.id,
      creatorId: listing.creatorId,
      viewerId: input.reporterId,
      timestamp: report.createdAt,
      meta: { reason: input.reason, delisted, delistReason: reason },
    });
    return { ok: true as const, listing: updated, delisted, report };
  }

  appealListing(input: {
    id: string;
    listingId: string;
    creatorId: string;
    message: string;
  }) {
    const listing = this.state.listings.get(input.listingId);
    if (!listing) return { ok: false as const, error: "not_found" };
    if (!listing.delisted) return { ok: false as const, error: "not_delisted" };
    const appeal = submitAppeal(input);
    this.state.appeals.push(appeal);
    this.state.listings.set(listing.id, {
      ...listing,
      appealStatus: "pending",
    });
    return { ok: true as const, appeal };
  }

  resolveAppeal(appealId: string, status: "approved" | "rejected") {
    const appeal = this.state.appeals.find((a) => a.id === appealId);
    if (!appeal) return { ok: false as const, error: "not_found" };
    const listing = this.state.listings.get(appeal.listingId);
    if (!listing) return { ok: false as const, error: "listing_not_found" };
    const resolved = resolveAppeal(listing, appeal, status);
    this.state.listings.set(listing.id, resolved.listing);
    const idx = this.state.appeals.findIndex((a) => a.id === appealId);
    this.state.appeals[idx] = resolved.appeal;
    return { ok: true as const, ...resolved };
  }

  nominate(listingId: string, curatorId: string) {
    const listing = this.state.listings.get(listingId);
    const curator = this.state.creators.get(curatorId);
    if (!listing || !curator) return { ok: false as const, error: "not_found" };
    const result = nominateListing(listing, curator);
    if (!result.ok || !result.listing || !result.curator) {
      return { ok: false as const, error: result.error ?? "nominate_failed" };
    }
    this.state.listings.set(listingId, result.listing);
    this.state.creators.set(curatorId, result.curator);
    return { ok: true as const, listing: result.listing, curator: result.curator };
  }

  recordView(input: {
    listingId: string;
    viewerId: string;
    dwellMs: number;
  }) {
    const listing = this.state.listings.get(input.listingId);
    if (!listing) return;
    const creator = this.state.creators.get(listing.creatorId);
    listing.signals.uniqueViewers += 1;
    listing.signals.dwellMsTotal += input.dwellMs;
    listing.signals.impressionsToday += 1;
    listing.signals.impressionsThisWeek += 1;

    if (isMeaningfulView(input.dwellMs) && creator) {
      const emerging = isEmergingListing(listing, creator).emerging;
      this.metrics.record({
        type: "meaningful_view",
        listingId: listing.id,
        creatorId: creator.id,
        viewerId: input.viewerId,
        emerging,
        timestamp: Date.now(),
        meta: { dwellMs: input.dwellMs },
      });
    }
  }

  recordPurchase(input: {
    listingId: string;
    buyerId: string;
    amountUsd: number;
    isFirstPurchaseForBuyerOnArtifact: boolean;
  }) {
    const listing = this.state.listings.get(input.listingId);
    if (!listing) return;
    const creator = this.state.creators.get(listing.creatorId);
    if (!creator) return;
    creator.completedSales += 1;
    creator.lifetimePrimaryVolumeUsd += input.amountUsd;
    const emerging = isEmergingListing(listing, creator).emerging;
    this.metrics.record({
      type: input.isFirstPurchaseForBuyerOnArtifact
        ? "first_purchase"
        : "purchase",
      listingId: listing.id,
      creatorId: creator.id,
      viewerId: input.buyerId,
      emerging,
      timestamp: Date.now(),
      meta: { amountUsd: input.amountUsd },
    });
  }

  getCollectionSurface(collectionId: string) {
    const collection = this.state.collections.get(collectionId);
    if (!collection) return null;
    const items = [...this.state.listings.values()].filter(
      (l) => l.collectionId === collectionId,
    );
    const creator = this.state.creators.get(collection.creatorId);
    const hasTraction =
      (creator?.completedSales ?? 0) >= 5 ||
      items.reduce((s, l) => s + l.signals.uniqueViewers, 0) >= 50;
    const surfaceIds = collectionFeedSurface(
      collection.heroListingId,
      collection.sampleListingIds,
      items.map((i) => i.id),
      hasTraction,
    );
    return {
      collection,
      listings: surfaceIds
        .map((id) => this.state.listings.get(id))
        .filter((l): l is Listing => !!l),
      hasTraction,
    };
  }
}
