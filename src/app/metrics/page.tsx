import { getEngine } from "@/lib/data/store";
import { DISCOVERY_CONFIG } from "@/lib/discovery";

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export default function MetricsPage() {
  const engine = getEngine();
  // Ensure some impressions exist for the dashboard.
  engine.buildHomepage("collector-mira", 16);
  const snap = engine.metrics.snapshot();
  const budgets = engine.getBudgets();

  const cards = [
    {
      label: "Emerging impression share",
      value: pct(snap.emergingImpressionShare),
      hint: "Target: healthy Emerging exposure without random noise",
    },
    {
      label: "Feed entropy",
      value: snap.feedEntropy.toFixed(2),
      hint: "Higher = more artist diversity per 100 impressions",
    },
    {
      label: "Spam rate",
      value: pct(snap.spamRate),
      hint: "Reports relative to impressions",
    },
    {
      label: "Duplicates blocked",
      value: String(snap.duplicatesBlocked),
      hint: "Near-duplicate media rejected at upload",
    },
    {
      label: "Emerging first purchases",
      value: `${snap.emergingFirstPurchases}/${snap.firstPurchases}`,
      hint: "Conversion proof for Emerging lane",
    },
    {
      label: "Rising abuse events",
      value: String(snap.risingAbuse),
      hint: "Weekly Rising cap / cooldown violations",
    },
    {
      label: "Meaningful views",
      value: String(snap.meaningfulViews),
      hint: `Dwell ≥ ${DISCOVERY_CONFIG.meaningfulViewDwellMs / 1000}s`,
    },
    {
      label: "Avg time to first view",
      value:
        snap.avgTimeToFirstMeaningfulViewMs == null
          ? "—"
          : `${(snap.avgTimeToFirstMeaningfulViewMs / 3600000).toFixed(1)}h`,
      hint: "Emerging creators: soft launch → meaningful view",
    },
  ];

  return (
    <div style={{ padding: "2.5rem clamp(1rem, 4vw, 3rem) 4rem" }}>
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Discovery metrics
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "54ch", marginBottom: "1.75rem" }}>
        Locked rules: Emerging quota {pct(DISCOVERY_CONFIG.emergingRisingQuota)}{" "}
        of {budgets.risingTotal} Rising slots · feed mix{" "}
        {pct(DISCOVERY_CONFIG.feedMix.emerging_rising)} /{" "}
        {pct(DISCOVERY_CONFIG.feedMix.following)} /{" "}
        {pct(DISCOVERY_CONFIG.feedMix.featured)} /{" "}
        {pct(DISCOVERY_CONFIG.feedMix.auctions_live)}.
      </p>
      <div className="metric-grid">
        {cards.map((card) => (
          <div
            key={card.label}
            style={{
              border: "1px solid var(--line)",
              padding: "1rem 1.1rem",
              background: "rgba(20,53,44,0.55)",
            }}
          >
            <div
              style={{
                color: "var(--ink-muted)",
                fontSize: "0.8rem",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {card.label}
            </div>
            <div
              className="display"
              style={{ fontSize: "1.8rem", margin: "0.35rem 0" }}
            >
              {card.value}
            </div>
            <div style={{ color: "var(--ink-muted)", fontSize: "0.88rem" }}>
              {card.hint}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
