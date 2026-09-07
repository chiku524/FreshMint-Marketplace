"use client";

import { DiscoveryEngineDiagram } from "@/components/DiscoveryEngineDiagram";
import { NftLifecycleDiagram } from "@/components/NftLifecycleDiagram";
import { DISCOVERY_CONFIG, getDailySlotBudgets } from "@/lib/discovery";
import { PLATFORM_FEE_PERCENT } from "@/lib/fees/platform";
import Link from "next/link";
import { useLayoutEffect, useState } from "react";

const TOC = [
  {
    id: "flow",
    label: "The life of a work",
    blurb: "Mint at publish. Buy with crypto. Own in your wallet.",
  },
  {
    id: "settlement",
    label: "Settlement",
    blurb: "Primary sales pay native on-chain, then transfer the NFT.",
  },
  {
    id: "fees",
    label: "Fees",
    blurb: `${PLATFORM_FEE_PERCENT.total}% treasury. Seller keeps ${PLATFORM_FEE_PERCENT.sellerNet}%.`,
  },
  {
    id: "withdraw",
    label: "Ownership",
    blurb: "New buys land in your wallet. Withdraw is for legacy holds.",
  },
  {
    id: "discovery",
    label: "Discovery",
    blurb: "Attention is scarce. Emerging quota is enforced in code.",
  },
] as const;

type SectionId = (typeof TOC)[number]["id"];

function readSection(): SectionId {
  const id = window.location.hash.replace(/^#/, "");
  return TOC.some((item) => item.id === id) ? (id as SectionId) : "flow";
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function days(ms: number) {
  return `${Math.round(ms / (24 * 60 * 60 * 1000))} days`;
}

function hours(ms: number) {
  return `${Math.round(ms / (60 * 60 * 1000))}h`;
}

export function DocsGuide() {
  const [active, setActive] = useState<SectionId>("flow");
  const cfg = DISCOVERY_CONFIG;
  const budgets = getDailySlotBudgets();
  const mix = cfg.feedMix;

  useLayoutEffect(() => {
    const sync = () => setActive(readSection());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const select = (id: SectionId) => {
    setActive(id);
    if (window.location.hash !== `#${id}`) {
      window.history.replaceState(null, "", `#${id}`);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="page-wrap docs-guide-page">
      <header className="docs-guide__intro">
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
          Collect on FreshMint with crypto. Creators mint when they publish;
          buyers receive the NFT in-wallet at purchase.
        </p>
      </header>

      <div className="docs-guide">
        <nav className="docs-toc" aria-label="How it works">
          <p className="docs-toc__kicker">Contents</p>
          <ol className="docs-toc__list">
            {TOC.map((item, index) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={active === item.id ? "is-active" : undefined}
                  aria-current={active === item.id ? "page" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    select(item.id);
                  }}
                >
                  <span className="docs-toc__index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="docs-toc__copy">
                    <span className="docs-toc__label">{item.label}</span>
                    <span className="docs-toc__blurb">{item.blurb}</span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="docs-guide__panel">
          {active === "flow" ? (
          <section id="flow">
            <NftLifecycleDiagram />
          </section>
          ) : null}

          {active === "settlement" ? (
          <section id="settlement">
            <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
              Settlement
            </h2>
            <p style={{ color: "var(--ink-muted)", margin: "0 0 1rem", lineHeight: 1.6 }}>
              Primary sales settle on-chain. Discovery — saving, following,
              nominating, browsing — stays on the FreshMint ledger so ranking
              stays cheap.
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
                  At publish
                </h3>
                <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.92rem", lineHeight: 1.55 }}>
                  Create deploys your collection and mints pieces into it. You pay
                  gas on those steps. Unminted drafts stay off Open Lane.
                </p>
              </div>
              <div>
                <h3 className="display" style={{ margin: "0 0 0.4rem", fontSize: "1rem" }}>
                  At purchase
                </h3>
                <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.92rem", lineHeight: 1.55 }}>
                  Collectors pay native (or <Link href="/bridge">bridge</Link> via
                  Relay) and the minted NFT transfers to their wallet. Boing stays
                  same-chain.
                </p>
              </div>
            </div>
          </section>
          ) : null}

          {active === "fees" ? (
          <section id="fees">
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
              . Quote is in USD; you pay the native amount shown at checkout.
            </p>
            <p style={{ color: "var(--ink-muted)", margin: 0, lineHeight: 1.6 }}>
              That cut funds community events, future updates, and running the
              market — not a hidden operator take on top. You can see the split
              before you confirm a buy.
            </p>
          </section>
          ) : null}

          {active === "withdraw" ? (
          <section id="withdraw">
            <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
              Ownership
            </h2>
            <p style={{ color: "var(--ink-muted)", margin: 0, lineHeight: 1.6 }}>
              Crypto purchases transfer the already-minted token to your wallet
              when the buy confirms. Open{" "}
              <Link href="/me">your collection</Link> to resume an interrupted
              checkout or see explorer links.{" "}
              <strong style={{ color: "var(--ink)" }}>Withdraw to wallet</strong>{" "}
              remains only for older USD holds. Link a matching wallet in{" "}
              <Link href="/me/settings">Settings</Link>.
            </p>
          </section>
          ) : null}

          {active === "discovery" ? (
          <section id="discovery" className="docs-discovery">
            <DiscoveryEngineDiagram />
            <header className="docs-discovery__lead">
            <h2 className="display" style={{ margin: "1.75rem 0 0.75rem", fontSize: "1.45rem" }}>
              Rules in code
            </h2>
            <p style={{ color: "var(--ink-muted)", margin: "0 0 1rem", maxWidth: "48ch" }}>
              FreshMint treats attention as scarce inventory. These numbers are
              loaded from live product config — the same constants the ranker
              enforces.
            </p>
            <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--ink-muted)" }}>
              Deep reference:{" "}
              <code style={{ color: "var(--accent-soft)" }}>docs/discovery.md</code>
              {" · "}
              <Link href="/metrics" style={{ color: "var(--emergent)" }}>
                live wedge metrics
              </Link>
            </p>
            </header>

            <div className="docs-discovery__block">
            <h3 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.15rem" }}>
              Surfaces
            </h3>
            <p style={{ color: "var(--ink-muted)", margin: "0 0 1.25rem", maxWidth: "48ch" }}>
              Four jobs, not one firehose. Anyone can list; only a fraction earns
              high-visibility slots.
            </p>
            <div className="docs-discovery__surfaces">
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
            </div>

            <div className="docs-discovery__block">
            <h3 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.15rem" }}>
              Homepage mix
            </h3>
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
            </div>

            <div className="docs-discovery__block">
            <h3 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.15rem" }}>
              Listing stages
            </h3>
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
            <ul style={{ margin: 0, paddingLeft: "1.1rem", color: "var(--ink-muted)", lineHeight: 1.7 }}>
              <li>
                <strong style={{ color: "var(--ink)" }}>Draft</strong> — private
                until mint + soft-launch. Create will not list unminted work.
              </li>
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
            </div>

            <div className="docs-discovery__block">
            <h3 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.15rem" }}>
              Emerging
            </h3>
            <p style={{ color: "var(--ink-muted)", margin: "0 0 1rem" }}>
              A creator is Emerging for the first{" "}
              {cfg.emerging.maxDaysSinceFirstListing} days after their first
              listing, unless they already cleared{" "}
              {cfg.emerging.graduationThresholdsRequired} commercial thresholds.
              After that window they leave the reserved Rising slice so true
              newcomers are not crowded out. External follower fame is ignored.
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
            <p style={{ margin: "1.15rem 0 0", color: "var(--emergent)" }}>
              Rising reserves {pct(cfg.emergingRisingQuota)} of its daily slots for
              Emerging works ({budgets.risingEmergingReserved} of {budgets.risingTotal}{" "}
              today) and {budgets.risingExplore} low-exposure explore slots.
            </p>
            </div>

            <div className="docs-discovery__block">
            <h3 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.15rem" }}>
              How works are scored
            </h3>
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
            <p style={{ color: "var(--ink-muted)", margin: 0, lineHeight: 1.65 }}>
              Quality is a Bayesian engagement <em>rate</em> (saves, follows, dwell,
              listing-page views versus feed impressions, and nominations per unique
              viewer), not a raw popularity sum. Saves from
              listings with fewer than {cfg.sybil.minUniqueViewersForSaveTrust} unique
              viewers are discounted. Novelty lifts low-exposure artists and applies
              listing-type weights. Diversity allows at most one artist per screen;
              artists already seen this session are downranked, not hidden, so a
              new work can earn a second look. Impression fair-share (
              {cfg.impressionFairSharePerDay.toLocaleString()}/day) applies decay so
              winners cannot monopolize Rising forever. Singles get a short Rising-age
              burst; open editions and auctions keep their own clocks.
            </p>
            </div>

            <div className="docs-discovery__block">
            <h3 className="display" style={{ margin: "0 0 0.85rem", fontSize: "1.15rem" }}>
              Congestion & trust
            </h3>
            <div className="docs-discovery__trust">
              <div>
                <h4 className="display" style={{ margin: "0 0 0.4rem", fontSize: "1rem" }}>
                  Caps
                </h4>
                <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.92rem", lineHeight: 1.55 }}>
                  Open Lane {cfg.openLaneListingsPerCreatorPerDay}/creator/day · Rising{" "}
                  {cfg.risingEntriesPerCreatorPerWeek}/week · OE starts ≤{" "}
                  {cfg.calendar.maxOeStartsPerHour}/hour · auctions ≤{" "}
                  {cfg.calendar.maxAuctionStartsPerHour}/hour · ≤{" "}
                  {cfg.maxConcurrentOeOnRising} concurrent OE on Rising
                </p>
              </div>
              <div>
                <h4 className="display" style={{ margin: "0 0 0.4rem", fontSize: "1rem" }}>
                  Integrity
                </h4>
                <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.92rem", lineHeight: 1.55 }}>
                  Near-duplicate media checks, reports & appeals, nomination stake (
                  {cfg.nominationStakePoints} pts · +{cfg.nominationRewardPoints} / −
                  {cfg.nominationPenaltyPoints}), sybil-lite signal caps, wash-purchase
                  heuristics. New accounts: {days(cfg.sybil.newAccountAgeMs)} soft
                  engagement limits.
                </p>
              </div>
              <div>
                <h4 className="display" style={{ margin: "0 0 0.4rem", fontSize: "1rem" }}>
                  Collectors
                </h4>
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
            </div>

            <div className="docs-discovery__block">
            <h3 className="display" style={{ margin: "0 0 0.85rem", fontSize: "1.15rem" }}>
              Explore
            </h3>
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
            </div>
          </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
