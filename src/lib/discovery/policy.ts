import { DISCOVERY_CONFIG } from "./config";
import type { DiscoveryMetricsSnapshot } from "./metrics";

export type PolicyAction =
  | "increase_explore"
  | "hold_quota"
  | "enforce_featured_dominance"
  | "tighten_diversity";

export interface PolicyRecommendation {
  action: PolicyAction;
  reason: string;
}

export interface PolicyReport {
  recommendations: PolicyRecommendation[];
  emergingConversionGap: number;
}

/**
 * Weekly (or on-demand) policy check. Recommendations only — no live auto-tune.
 */
export function evaluateDiscoveryPolicy(
  snap: DiscoveryMetricsSnapshot,
): PolicyReport {
  const cfg = DISCOVERY_CONFIG.policy;
  const recommendations: PolicyRecommendation[] = [];
  const emergingConversionGap =
    snap.emergingImpressionShare - snap.emergingFirstPurchaseShare;

  if (
    snap.impressions > 20 &&
    snap.emergingImpressionShare >= cfg.emergingImpressionHigh &&
    snap.emergingFirstPurchaseShare < cfg.emergingConversionFloor
  ) {
    recommendations.push({
      action: "increase_explore",
      reason:
        "Emerging impressions are high but first-purchase conversion is near zero — ranking may be too random.",
    });
  }

  if (
    snap.impressions > 20 &&
    snap.emergingImpressionShare < cfg.emergingImpressionHealthyMin
  ) {
    recommendations.push({
      action: "enforce_featured_dominance",
      reason:
        "Volume leaders are capturing Rising — enforce Featured-dominance blocking or raise the Emerging quota.",
    });
  }

  if (snap.impressions > 20 && snap.feedEntropy < cfg.feedEntropyFloor) {
    recommendations.push({
      action: "tighten_diversity",
      reason:
        "Feed entropy collapsed — tighten artist/collection caps or session diversity.",
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      action: "hold_quota",
      reason:
        "Emerging exposure and conversion are within the locked policy band. Leave quotas as-is.",
    });
  }

  return { recommendations, emergingConversionGap };
}
