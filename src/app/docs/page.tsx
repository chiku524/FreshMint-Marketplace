import { DISCOVERY_CONFIG, getDailySlotBudgets } from "@/lib/discovery";
import { PLATFORM_FEE_PERCENT } from "@/lib/fees/platform";
import Link from "next/link";

export const metadata = {
  title: "How FreshMint works — FreshMint Marketplace",
  description:
    "Off-chain collecting, 3% treasury fee, optional NFT withdraw, and how discovery allocates attention.",
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
    <div className="page-wrap">
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
          How it works
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
          Collect and create without gas. Pay a chain only when you withdraw an
          NFT or move ETH, SOL, or Boing.
        </p>
        <nav className="docs-toc" aria-label="On this page">
          <Link href="#settlement">Settlement</Link>
          <Link href="#fees">Fees</Link>
          <Link href="#withdraw">Withdraw</Link>
          <Link href="#discovery">Discovery</Link>
        </nav>
      </header>

      <section id="settlement" style={{ maxWidth: "48rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Settlement
        </h2>
        <p style={{ color: "var(--ink-muted)", margin: "0 0 1rem", lineHeight: 1.6 }}>
          FreshMint is a platform ledger first. That keeps everyday activity
          cheap and leaves the chain for moments that need a wallet.
        </p>
        <div
          style={{
            display: "grid",
            gap: "1.25rem 2rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
          }}
        >
          <div>
            <h3 className="display" style={{ margin: "0 0 0.4rem", fontSize: "1rem" }}>
              On FreshMint
            </h3>
            <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.92rem", lineHeight: 1.55 }}>
              Create a collection or scheduled drop, buy, save, follow, nominate,
              and browse. No wallet prompt and no gas.
            </p>
          </div>
          <div>
            <h3 className="display" style={{ margin: "0 0 0.4rem", fontSize: "1rem" }}>
              On-chain, when you choose
            </h3>
            <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.92rem", lineHeight: 1.55 }}>
              Withdraw a collected NFT to EVM, Solana, or Boing. Deposit,
              withdraw, or <Link href="/bridge">bridge</Link> ETH, SOL, or Boing.
            </p>
          </div>
        </div>
      </section>

      <section id="fees" style={{ maxWidth: "48rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Treasury fee
        </h2>
        <p style={{ color: "var(--ink-muted)", margin: "0 0 1rem", lineHeight: 1.6 }}>
          Every primary sale takes{" "}
          <strong style={{ color: "var(--ink)" }}>
            {PLATFORM_FEE_PERCENT.total}%
          </strong>{" "}
          for the marketplace treasury. The seller keeps{" "}
          <strong style={{ color: "var(--ink)" }}>
            {PLATFORM_FEE_PERCENT.sellerNet}%
          </strong>
          . You still pay the listed USD price.
        </p>
        <p style={{ color: "var(--ink-muted)", margin: 0, lineHeight: 1.6 }}>
          That cut funds community events, future updates, and running the
          market — not a hidden operator take on top. You can see the split
          before you confirm a buy.
        </p>
      </section>

      <section id="withdraw" style={{ maxWidth: "48rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Withdraw an NFT
        </h2>
        <p style={{ color: "var(--ink-muted)", margin: 0, lineHeight: 1.6 }}>
          Collected work stays in your FreshMint profile until you want it in a
          wallet. Open{" "}
          <Link href="/me">your collection</Link>, choose{" "}
          <strong style={{ color: "var(--ink)" }}>Withdraw to wallet</strong>, and
          sign the mint for that network. Link a matching wallet in{" "}
          <Link href="/me/settings">Settings</Link> first. Gas is yours only on
          that step.
        </p>
      </section>

      <section id="discovery" style={{ maxWidth: "52rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Discovery
        </h2>
        <p style={{ color: "var(--ink-muted)", margin: "0 0 1.25rem", maxWidth: "48ch" }}>
          FreshMint treats attention as scarce inventory. These rules are loaded
          from live product config — the same constants the ranker enforces.
        </p>
        <p style={{ margin: "0 0 1.25rem", fontSize: "0.9rem", color: "var(--ink-muted)" }}>
          Deep reference:{" "}
          <code style={{ color: "var(--accent-soft)" }}>docs/discovery.md</code>
          {" · "}
          <Link href="/metrics" style={{ color: "var(--emergent)" }}>
            live wedge metrics
          </Link>
        </p>
        <h3 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.15rem" }}>
          Surfaces
        </h3>
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
              job: `Fair discovery pool. ${budgets.risingEmergingReserved} of ${budgets.risingTotal} daily slots reserved for Emerging, ${budgets.risingExplore} explore.`,
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

      <section>
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
          at {cfg.maxCollectionFloodPerSession} per session · one chain ≤{" "}
          {pct(cfg.maxChainSharePerPage)} of a page. Guest Emerging uses a taste
          seed, not a demo follow graph.
        </p>
      </section>

      <section style={{ maxWidth: "48rem" }}>
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

      <section style={{ maxWidth: "48rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Emerging
        </h2>
        <p style={{ color: "var(--ink-muted)", margin: "0 0 1rem" }}>
          A creator is Emerging if they are not flagged or in a wash cluster and
          they have exceeded fewer than{" "}
          {cfg.emerging.graduationThresholdsRequired} of the three thresholds
          below (two-of-three graduation). External follower fame is ignored.
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
          today) and {budgets.risingExplore} low-exposure explore slots.
        </p>
      </section>

      <section style={{ maxWidth: "48rem" }}>
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
          Quality is a Bayesian engagement <em>rate</em> (saves, follows, dwell,
          listing-page views versus feed impressions, and nominations per unique
          viewer), not a raw popularity sum. Saves from
          listings with fewer than {cfg.sybil.minUniqueViewersForSaveTrust} unique
          viewers are discounted. Novelty lifts low-exposure artists and applies
          listing-type weights. Diversity blocks the same artist from flooding a
          session. Impression fair-share (
          {cfg.impressionFairSharePerDay.toLocaleString()}/day) applies decay so
          winners cannot monopolize Rising forever. Singles get a short Rising-age
          burst; open editions and auctions keep their own clocks.
        </p>
      </section>

      <section style={{ maxWidth: "48rem" }}>
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
              Follow artists, collectors, and shelves to fill the Following slice.
              Collectors you follow contribute their graph. Nominate Emerging
              works into Rising with reputation at stake. Create shelves
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
          <Link href="/collections" className="badge">
            Collections
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
