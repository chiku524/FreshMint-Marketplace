import { DISCOVERY_CONFIG } from "./config";
import type { MetricEvent, RankedListing } from "./types";

export interface DiscoveryMetricsSnapshot {
  impressions: number;
  emergingImpressions: number;
  emergingImpressionShare: number;
  firstPurchases: number;
  emergingFirstPurchases: number;
  emergingFirstPurchaseShare: number;
  meaningfulViews: number;
  reports: number;
  duplicatesBlocked: number;
  risingAbuse: number;
  spamRate: number;
  /** Shannon entropy across artists per 100 impressions window. */
  feedEntropy: number;
  /** Average ms from first listing soft launch to first meaningful view (emerging only). */
  avgTimeToFirstMeaningfulViewMs: number | null;
  collectorEmergingBuyers: number;
  collectorEmergingBuyerRetentionProxy: number;
}

function shannonEntropy(counts: Map<string, number>): number {
  let total = 0;
  for (const c of counts.values()) total += c;
  if (total === 0) return 0;
  let h = 0;
  for (const c of counts.values()) {
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h;
}

export class MetricsCollector {
  private events: MetricEvent[] = [];
  /** creatorId -> first soft-launch / listing timestamp for TTFV */
  private firstListingAt = new Map<string, number>();
  private firstMeaningfulViewAt = new Map<string, number>();
  /** viewers who bought emerging */
  private emergingBuyers = new Set<string>();
  private emergingBuyersReturning = new Set<string>();

  record(event: MetricEvent): void {
    this.events.push(event);

    if (
      event.type === "meaningful_view" &&
      event.creatorId &&
      event.emerging &&
      !this.firstMeaningfulViewAt.has(event.creatorId)
    ) {
      this.firstMeaningfulViewAt.set(event.creatorId, event.timestamp);
    }

    if (event.type === "first_purchase" && event.viewerId && event.emerging) {
      if (this.emergingBuyers.has(event.viewerId)) {
        this.emergingBuyersReturning.add(event.viewerId);
      }
      this.emergingBuyers.add(event.viewerId);
    }

    if (event.type === "purchase" && event.viewerId && event.emerging) {
      if (this.emergingBuyers.has(event.viewerId)) {
        this.emergingBuyersReturning.add(event.viewerId);
      } else {
        this.emergingBuyers.add(event.viewerId);
      }
    }
  }

  registerCreatorFirstListing(creatorId: string, at: number): void {
    if (!this.firstListingAt.has(creatorId)) {
      this.firstListingAt.set(creatorId, at);
    }
  }

  recordFeedImpressions(items: RankedListing[], viewerId?: string, now = Date.now()): void {
    for (const item of items) {
      this.record({
        type: "impression",
        listingId: item.listing.id,
        creatorId: item.listing.creatorId,
        viewerId,
        emerging: item.emerging,
        bucket: item.bucket,
        timestamp: now,
      });
    }
  }

  snapshot(): DiscoveryMetricsSnapshot {
    const impressions = this.events.filter((e) => e.type === "impression");
    const emergingImpressions = impressions.filter((e) => e.emerging).length;
    const firstPurchases = this.events.filter((e) => e.type === "first_purchase");
    const emergingFirstPurchases = firstPurchases.filter((e) => e.emerging).length;
    const meaningfulViews = this.events.filter((e) => e.type === "meaningful_view").length;
    const reports = this.events.filter((e) => e.type === "report").length;
    const duplicatesBlocked = this.events.filter((e) => e.type === "duplicate_blocked").length;
    const risingAbuse = this.events.filter((e) => e.type === "rising_abuse").length;

    const artistCounts = new Map<string, number>();
    for (const e of impressions.slice(-100)) {
      if (!e.creatorId) continue;
      artistCounts.set(e.creatorId, (artistCounts.get(e.creatorId) ?? 0) + 1);
    }

    const ttfv: number[] = [];
    for (const [creatorId, viewAt] of this.firstMeaningfulViewAt) {
      const start = this.firstListingAt.get(creatorId);
      if (start != null && viewAt >= start) ttfv.push(viewAt - start);
    }

    const spamDenominator = impressions.length + reports;
    const spamRate = spamDenominator === 0 ? 0 : reports / spamDenominator;

    return {
      impressions: impressions.length,
      emergingImpressions,
      emergingImpressionShare:
        impressions.length === 0 ? 0 : emergingImpressions / impressions.length,
      firstPurchases: firstPurchases.length,
      emergingFirstPurchases,
      emergingFirstPurchaseShare:
        firstPurchases.length === 0
          ? 0
          : emergingFirstPurchases / firstPurchases.length,
      meaningfulViews,
      reports,
      duplicatesBlocked,
      risingAbuse,
      spamRate,
      feedEntropy: shannonEntropy(artistCounts),
      avgTimeToFirstMeaningfulViewMs:
        ttfv.length === 0 ? null : ttfv.reduce((a, b) => a + b, 0) / ttfv.length,
      collectorEmergingBuyers: this.emergingBuyers.size,
      collectorEmergingBuyerRetentionProxy:
        this.emergingBuyers.size === 0
          ? 0
          : this.emergingBuyersReturning.size / this.emergingBuyers.size,
    };
  }

  getEvents(): MetricEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
    this.firstListingAt.clear();
    this.firstMeaningfulViewAt.clear();
    this.emergingBuyers.clear();
    this.emergingBuyersReturning.clear();
  }
}

export function isMeaningfulView(dwellMs: number): boolean {
  return dwellMs >= DISCOVERY_CONFIG.meaningfulViewDwellMs;
}
