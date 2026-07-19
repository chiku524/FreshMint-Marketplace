import { DISCOVERY_CONFIG, getDailySlotBudgets } from "@/lib/discovery";
import Link from "next/link";

export const metadata = {
  title: "Discovery docs — FreshMint Marketplace",
  description:
    "How FreshMint allocates attention: Rising, Emerging quotas, staging, and feed mix.",
};

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function days(ms: number) {
  return `${Math.round(ms / (24 * 60 * 60 * 1000))} days`;
}

function hours(ms: number) {
  return `${Math.round(ms / (60 * 60 * 1000))}h`;
}

export default function DocsPage() {
  const cfg = DISCOVERY_CONFIG;
  const budgets = getDailySlotBudgets();
  const mix = cfg.feedMix;

  return (
    <div style={{ padding: "2.5rem clamp(1rem, 4vw, 3rem) 4rem" }}>
      <header style={{ maxWidth: "40rem", marginBottom: "2.75rem" }}>
        <p
          className="display"
          style={{
            margin: "0 0 0.5rem",
            fontSize: "clamp(2.2rem, 5vw, 3.2rem)",
            fontWeight: 800,
            lineHeight: 0.95,
          }}
        >
          Discovery
        </p>
        <p
          style={{
            margin: 0,
            color: "var(--ink-muted)",
            fontSize: "1.1rem",
            lineHeight: 1.5,
            maxWidth: "42ch",
          }}
        >
          FreshMint treats attention as scarce inventory. These rules are loaded
          from live product config — the same constants the ranker enforces.
        </p>
        <p style={{ margin: "1rem 0 0", fontSize: "0.9rem", color: "var(--ink-muted)" }}>
          Deep reference for contributors:{" "}
          <code style={{ color: "var(--accent-soft)" }}>docs/discovery.md</code>{" "}
          in the repo ·{" "}
          <Link href="/metrics" style={{ color: "var(--emergent)" }}>
            live wedge metrics
          </Link>
        </p>
      </header>

      <section style={{ marginBottom: "3rem", maxWidth: "52rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Surfaces
        </h2>
        <p style={{ color: "var(--ink-muted)", margin: "0 0 1.25rem", maxWidth: "48ch" }}>
          Four jobs, not one firehose. Anyone can list; only a fraction earns
          high-visibility slots.
        </p>
        <div
          style={{
            display: "grid",
            gap: "1.25rem 2rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
          }}
        >
          {[
            {
              name: "Open Lane",
              href: "/open",
              job: "Permissionless browse with filters. Soft-launched works appear here first.",
            },
            {
              name: "Rising",
              href: "/rising",
              job: `Fair discovery pool. ${budgets.risingEmergingReserved} of ${budgets.risingTotal} daily slots reserved for Emerging.`,
            },
            {
              name: "Featured",
              href: "/featured",
              job: `Editorial / trust inventory — ${cfg.featuredSlotsPerDay} slots per day.`,
            },
            {
              name: "Homepage",
              href: "/",
              job: "Composed mix of Emerging Rising, Following, Featured, and live auctions.",
            },
          ].map((s) => (
            <div key={s.name}>
              <Link
                href={s.href}
                className="display"
                style={{ fontSize: "1.15rem", color: "var(--accent-soft)" }}
              >
                {s.name}
              </Link>
              <p style={{ margin: "0.35rem 0 0", color: "var(--ink-muted)", fontSize: "0.95rem" }}>
                {s.job}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          marginBottom: "3rem",
          padding: "1.5rem 0",
          borderTop: "1px solid var(--line)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Homepage mix
        </h2>
        <div
          className="docs-mix-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "0.5rem",
            maxWidth: "36rem",
            marginBottom: "0.75rem",
          }}
        >
          {(
            [
              ["Emerging Rising", mix.emerging_rising, "var(--emergent)"],
              ["Following", mix.following, "var(--accent-soft)"],
              ["Featured", mix.featured, "var(--accent)"],
              ["Auctions", mix.auctions_live, "var(--ink-muted)"],
            ] as const
          ).map(([label, share, color]) => (
            <div key={label}>
              <div
                style={{
                  height: "0.35rem",
                  background: color,
                  opacity: 0.85,
                  marginBottom: "0.4rem",
                }}
              />
              <div className="display" style={{ fontSize: "1.25rem" }}>
                {pct(share)}
              </div>
              <div style={{ color: "var(--ink-muted)", fontSize: "0.78rem" }}>
                {label}
              </div>
            </div>
          ))}
        </div>
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.92rem" }}>
          Max {cfg.maxArtistPerScreen} artist per screen · collection flood capped
          at {cfg.maxCollectionFloodPerSession} per session window.
        </p>
      </section>

      <section style={{ marginBottom: "3rem", maxWidth: "48rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Listing stages
        </h2>
        <ol
          style={{
            margin: "0 0 1rem",
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.4rem",
          }}
        >
          {[
            "draft",
            "soft_launch",
            "rising_eligible",
            "featured_eligible",
            "featured",
          ].map((stage, i, arr) => (
            <li key={stage} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span className="badge">{stage.replace("_", " ")}</span>
              {i < arr.length - 1 ? (
                <span style={{ color: "var(--ink-muted)" }}>→</span>
              ) : null}
            </li>
          ))}
        </ol>
        <ul style={{ margin: 0, paddingLeft: "1.1rem", color: "var(--ink-muted)", lineHeight: 1.6 }}>
          <li>
            <strong style={{ color: "var(--ink)" }}>Soft launch</strong> — Open
            Lane + profile only; gather early signals
          </li>
          <li>
            <strong style={{ color: "var(--ink)" }}>Rising</strong> — after
            quality gates, wallet cooldown ({hours(cfg.newWalletRisingCooldownMs)}),
            and weekly Rising cap ({cfg.risingEntriesPerCreatorPerWeek}/creator)
          </li>
          <li>
            <strong style={{ color: "var(--ink)" }}>Featured</strong> — scarce
            editorial inventory; nomination + Studio controls
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: "3rem", maxWidth: "48rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Emerging
        </h2>
        <p style={{ color: "var(--ink-muted)", margin: "0 0 1rem" }}>
          A creator is Emerging if{" "}
          <em style={{ color: "var(--ink)" }}>any</em> threshold holds, and they
          are not flagged or in a wash cluster. External follower fame is ignored.
          Verification is not required for Rising.
        </p>
        <ul style={{ margin: 0, paddingLeft: "1.1rem", color: "var(--ink-muted)", lineHeight: 1.65 }}>
          <li>
            Lifetime primary volume under $
            {cfg.emerging.maxLifetimePrimaryVolumeUsd.toLocaleString()}
          </li>
          <li>Fewer than {cfg.emerging.maxCompletedSales} completed sales</li>
          <li>
            First {cfg.emerging.maxDaysSinceFirstListing} days since first listing
          </li>
        </ul>
        <p style={{ margin: "1rem 0 0", color: "var(--emergent)" }}>
          Rising reserves {pct(cfg.emergingRisingQuota)} of its daily slots for
          Emerging works ({budgets.risingEmergingReserved} of {budgets.risingTotal}{" "}
          today).
        </p>
      </section>

      <section style={{ marginBottom: "3rem", maxWidth: "48rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          How works are scored
        </h2>
        <p
          className="display"
          style={{
            margin: "0 0 0.75rem",
            fontSize: "1.05rem",
            color: "var(--accent-soft)",
            letterSpacing: "-0.02em",
          }}
        >
          quality × novelty × diversity × spam⁻¹ × decay × temporal
        </p>
        <p style={{ color: "var(--ink-muted)", margin: 0, lineHeight: 1.6 }}>
          Quality favors saves, dwell, unique viewers, and nominations — not raw
          clicks. Novelty lifts low-exposure artists. Diversity blocks the same
          artist from flooding a screen. Impression fair-share (
          {cfg.impressionFairSharePerDay.toLocaleString()}/day) applies decay so
          winners cannot monopolize Rising forever. Open editions and auctions get
          short temporal bursts, then decay hard.
        </p>
      </section>

      <section style={{ marginBottom: "3rem", maxWidth: "48rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Congestion & trust
        </h2>
        <div
          style={{
            display: "grid",
            gap: "1rem 2rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
          }}
        >
          <div>
            <h3 className="display" style={{ margin: "0 0 0.4rem", fontSize: "1rem" }}>
              Caps
            </h3>
            <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.92rem", lineHeight: 1.55 }}>
              Open Lane {cfg.openLaneListingsPerCreatorPerDay}/creator/day · Rising{" "}
              {cfg.risingEntriesPerCreatorPerWeek}/week · OE starts ≤{" "}
              {cfg.calendar.maxOeStartsPerHour}/hour · auctions ≤{" "}
              {cfg.calendar.maxAuctionStartsPerHour}/hour · ≤{" "}
              {cfg.maxConcurrentOeOnRising} concurrent OE on Rising
            </p>
          </div>
          <div>
            <h3 className="display" style={{ margin: "0 0 0.4rem", fontSize: "1rem" }}>
              Integrity
            </h3>
            <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.92rem", lineHeight: 1.55 }}>
              Near-duplicate media checks, reports & appeals, nomination stake (
              {cfg.nominationStakePoints} pts · +{cfg.nominationRewardPoints} / −
              {cfg.nominationPenaltyPoints}), sybil-lite signal caps, wash-purchase
              heuristics. New accounts: {days(cfg.sybil.newAccountAgeMs)} soft
              engagement limits.
            </p>
          </div>
          <div>
            <h3 className="display" style={{ margin: "0 0 0.4rem", fontSize: "1rem" }}>
              Collectors
            </h3>
            <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.92rem", lineHeight: 1.55 }}>
              Follow artists and shelves to fill the Following slice. Nominate
              Emerging works into Rising with reputation at stake. Create shelves
              in{" "}
              <Link href="/studio" style={{ color: "var(--accent-soft)" }}>
                Studio
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <section style={{ maxWidth: "40rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Explore
        </h2>
        <p style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", margin: 0 }}>
          <Link href="/rising" className="badge emerging">
            Rising
          </Link>
          <Link href="/open" className="badge">
            Open Lane
          </Link>
          <Link href="/featured" className="badge featured">
            Featured
          </Link>
          <Link href="/calendar" className="badge">
            Calendar
          </Link>
          <Link href="/metrics" className="badge">
            Metrics
          </Link>
          <Link href="/create" className="badge emerging">
            Soft-launch a work
          </Link>
        </p>
      </section>
    </div>
  );
}
