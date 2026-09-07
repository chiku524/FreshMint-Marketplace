"use client";

import { MintLeaf } from "@/components/MintLeaf";
import { DISCOVERY_CONFIG, getDailySlotBudgets } from "@/lib/discovery";
import { useEffect, useId, useMemo, useState } from "react";

type Band = "open" | "rising" | "scarce";

type Step = {
  id: string;
  title: string;
  lane: string;
  band: Band;
  x: number;
  y: number;
  body: string;
};

const VB_W = 1000;
const VB_H = 500;
const STEP_MS = 3800;

const SCORE_FACTORS = [
  "quality",
  "novelty",
  "diversity",
  "spam⁻¹",
  "decay",
  "temporal",
] as const;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function hours(ms: number) {
  return `${Math.round(ms / (60 * 60 * 1000))}h`;
}

function buildSteps(): Step[] {
  const cfg = DISCOVERY_CONFIG;
  const budgets = getDailySlotBudgets();
  return [
    {
      id: "open",
      title: "Open Lane",
      lane: "Permissionless",
      band: "open",
      x: 200,
      y: 90,
      body: "Anyone can soft-launch. Work shows on Open Lane and the artist profile — not the homepage. Listing is easy; attention is not automatic.",
    },
    {
      id: "score",
      title: "Score a rate",
      lane: "Engine",
      band: "open",
      x: 720,
      y: 90,
      body: `quality × novelty × diversity × spam⁻¹ × decay × temporal. Quality is a Bayesian engagement rate, not follower fame or raw impressions. Saves before ${cfg.sybil.minUniqueViewersForSaveTrust} unique viewers barely count.`,
    },
    {
      id: "rising",
      title: "Rising gates",
      lane: "Allocated",
      band: "rising",
      x: 200,
      y: 250,
      body: `Rising is a daily pool of ${budgets.risingTotal} slots. Gates: complete metadata, original media, ${hours(cfg.newWalletRisingCooldownMs)} new-wallet cooldown, ${cfg.risingEntriesPerCreatorPerWeek} entries/creator/week. Verification is not required.`,
    },
    {
      id: "quota",
      title: "Emerging quota",
      lane: "Enforced",
      band: "rising",
      x: 720,
      y: 250,
      body: `${pct(cfg.emergingRisingQuota)} of Rising (${budgets.risingEmergingReserved} of ${budgets.risingTotal} today) is reserved for Emerging — in the ranker, not a slogan. Another ${budgets.risingExplore} slots are a low-exposure explore slice. Graduation is two-of-three: volume, sales, or age.`,
    },
    {
      id: "mix",
      title: "Homepage mix",
      lane: "Composed",
      band: "scarce",
      x: 200,
      y: 410,
      body: `${pct(cfg.feedMix.emerging_rising)} Emerging Rising · ${pct(cfg.feedMix.following)} Following · ${pct(cfg.feedMix.featured)} Featured · ${pct(cfg.feedMix.auctions_live)} live auctions. Max ${cfg.maxArtistPerScreen} artist per screen. Winners decay after fair-share impressions so they cannot monopolize Rising.`,
    },
    {
      id: "featured",
      title: "Collectors & editors",
      lane: "Scarce",
      band: "scarce",
      x: 720,
      y: 410,
      body: `Collectors nominate with ${cfg.nominationStakePoints} curator points at stake. Shelves they curate feed Following. Editors pin Featured (${cfg.featuredSlotsPerDay}/day). None of those three own discovery alone.`,
    },
  ];
}

export function DiscoveryEngineDiagram() {
  const steps = useMemo(() => buildSteps(), []);
  const budgets = useMemo(() => getDailySlotBudgets(), []);
  const last = steps.length - 1;
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const reactId = useId();
  const captionId = `${reactId}-caption`;
  const headingId = `${reactId}-heading`;
  const step = steps[index];
  const cfg = DISCOVERY_CONFIG;

  useEffect(() => {
    if (!reducedMotion) setPlaying(true);
  }, [reducedMotion]);

  useEffect(() => {
    if (!playing || reducedMotion) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current >= last ? 0 : current + 1));
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [playing, reducedMotion, last]);

  const goTo = (next: number, pause = true) => {
    setIndex(Math.max(0, Math.min(last, next)));
    if (pause) setPlaying(false);
  };

  const pathD = steps
    .map((node, i) => `${i === 0 ? "M" : "L"} ${node.x} ${node.y}`)
    .join(" ");

  const slotKinds = useMemo(() => {
    return Array.from({ length: budgets.risingTotal }, (_, i) => {
      if (i < budgets.risingEmergingReserved) return "emerging" as const;
      if (i < budgets.risingEmergingReserved + budgets.risingExplore) {
        return "explore" as const;
      }
      return "open" as const;
    });
  }, [budgets]);

  const slotsLit = index >= 3;
  const mixLit = index >= 4;
  const scoreLit = index >= 1;

  return (
    <div
      className="nft-flow nft-flow--discovery"
      role="region"
      tabIndex={0}
      aria-labelledby={headingId}
      aria-describedby={captionId}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          goTo(index + 1);
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          goTo(index - 1);
        }
      }}
    >
      <div className="nft-flow__top">
        <div>
          <p className="nft-flow__kicker">Discovery engine</p>
          <h3 id={headingId} className="display nft-flow__title">
            Attention as scarce inventory
          </h3>
        </div>
        <div className="nft-flow__controls">
          <button type="button" onClick={() => goTo(index - 1)} disabled={index === 0}>
            Back
          </button>
          <button
            type="button"
            onClick={() => setPlaying((on) => !on)}
            aria-pressed={playing}
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button type="button" onClick={() => goTo(index + 1)} disabled={index === last}>
            Next
          </button>
          <span className="nft-flow__count" aria-hidden>
            {index + 1} / {steps.length}
          </span>
        </div>
      </div>

      <div className="nft-flow__legend" aria-hidden>
        <span className="nft-flow__legend-item is-ledger">Permissionless</span>
        <span className="nft-flow__legend-item is-rising">Allocated Rising</span>
        <span className="nft-flow__legend-item is-chain">Scarce homepage</span>
      </div>

      <div className="nft-flow__board" aria-hidden={false}>
        <svg
          className="nft-flow__wires"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
        >
          <defs>
            <linearGradient id={`${reactId}-wire`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7ed9a8" />
              <stop offset="55%" stopColor="#8ec8c0" />
              <stop offset="100%" stopColor="#d4ae66" />
            </linearGradient>
          </defs>
          <rect
            className="nft-flow__realm nft-flow__realm--ledger"
            x="24"
            y="24"
            width="952"
            height="128"
            rx="18"
          />
          <rect
            className="nft-flow__realm disc-engine__realm--rising"
            x="24"
            y="164"
            width="952"
            height="156"
            rx="18"
          />
          <rect
            className="nft-flow__realm nft-flow__realm--chain"
            x="24"
            y="332"
            width="952"
            height="144"
            rx="18"
          />
          <text className="nft-flow__realm-label" x="44" y="52">
            Open Lane
          </text>
          <text className="nft-flow__realm-label disc-engine__label-rising" x="44" y="192">
            Rising · {budgets.risingEmergingReserved}/{budgets.risingTotal} Emerging
          </text>
          <text className="nft-flow__realm-label is-chain" x="44" y="360">
            Homepage mix
          </text>

          <path className="nft-flow__path-base" d={pathD} />
          {steps.slice(1).map((node, i) => {
            const prev = steps[i];
            const lit = i < index;
            const current = i === index - 1;
            return (
              <line
                key={`${prev.id}-${node.id}`}
                className={`nft-flow__seg${lit ? " is-lit" : ""}${current ? " is-current" : ""}`}
                x1={prev.x}
                y1={prev.y}
                x2={node.x}
                y2={node.y}
                stroke={`url(#${reactId}-wire)`}
              />
            );
          })}

          {slotKinds.map((kind, i) => {
            const gap = 904 / slotKinds.length;
            return (
              <rect
                key={`slot-${i}`}
                className={`disc-slot disc-slot--${kind}${slotsLit ? " is-on" : ""}`}
                x={48 + i * gap}
                y={304}
                width={Math.max(8, gap - 4)}
                height={10}
                rx="2"
                style={{ animationDelay: `${i * 28}ms` }}
              />
            );
          })}

          {(["emerging_rising", "following", "featured", "auctions_live"] as const).map(
            (key, i) => {
              const shares = [
                cfg.feedMix.emerging_rising,
                cfg.feedMix.following,
                cfg.feedMix.featured,
                cfg.feedMix.auctions_live,
              ];
              const colors = ["#7ed9a8", "#8ec8c0", "#d4ae66", "#9ca3af"];
              const x0 = 48;
              const x =
                x0 +
                shares.slice(0, i).reduce((sum, s) => sum + s, 0) * 400;
              return (
                <rect
                  key={key}
                  className={`disc-mix${mixLit ? " is-on" : ""}`}
                  x={x}
                  y={452}
                  width={Math.max(8, shares[i]! * 400 - 4)}
                  height={12}
                  rx="2"
                  fill={colors[i]}
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              );
            },
          )}
        </svg>

        {steps.map((node, i) => (
          <button
            key={node.id}
            type="button"
            className={`nft-flow__node${i === index ? " is-active" : ""}${i < index ? " is-done" : ""}${node.band === "scarce" ? " is-chain" : ""}${node.band === "rising" ? " is-rising" : ""}`}
            style={{
              left: `${(node.x / VB_W) * 100}%`,
              top: `${(node.y / VB_H) * 100}%`,
            }}
            aria-current={i === index ? "step" : undefined}
            onClick={() => goTo(i)}
          >
            <span className="nft-flow__dot" />
            <span className="nft-flow__node-copy">
              <span className="nft-flow__lane">{node.lane}</span>
              <span className="nft-flow__node-title">{node.title}</span>
            </span>
          </button>
        ))}

        <div
          className={`nft-flow__token${step.band === "scarce" ? " is-minted" : " is-ledger"}`}
          style={{
            left: `${(step.x / VB_W) * 100}%`,
            top: `${(step.y / VB_H) * 100}%`,
          }}
          aria-hidden
        >
          <MintLeaf size={18} gradientId={`${reactId}-leaf`} title="" />
        </div>
      </div>

      <ol className="nft-flow__rail">
        {steps.map((node, i) => (
          <li key={`rail-${node.id}`}>
            <button
              type="button"
              className={`nft-flow__rail-step${i === index ? " is-active" : ""}${node.band === "scarce" ? " is-chain" : ""}${node.band === "rising" ? " is-rising" : ""}`}
              onClick={() => goTo(i)}
            >
              <span className="nft-flow__rail-index">{i + 1}</span>
              <span>
                <strong>{node.title}</strong>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <p className="disc-engine__formula" aria-hidden={step.id !== "score"}>
        {SCORE_FACTORS.map((factor, i) => (
          <span
            key={factor}
            className={`disc-engine__factor${scoreLit ? " is-on" : ""}${step.id === "score" ? " is-current" : ""}`}
            style={{ animationDelay: `${i * 90}ms` }}
          >
            {factor}
            {i < SCORE_FACTORS.length - 1 ? " × " : ""}
          </span>
        ))}
      </p>

      <div className="nft-flow__caption" id={captionId} aria-live="polite">
        <p className="nft-flow__caption-lane">
          {step.band === "open"
            ? "Permissionless"
            : step.band === "rising"
              ? "Allocated Rising"
              : "Scarce homepage"}
        </p>
        <p className="display nft-flow__caption-title">{step.title}</p>
        <p className="nft-flow__caption-body">{step.body}</p>
        <p className="nft-flow__aside">
          Ranking is chain-agnostic. Paying on Ethereum does not buy a homepage
          slot. External follower fame is ignored; Emerging is two-of-three
          graduation, not a badge you keep forever.
        </p>
      </div>
    </div>
  );
}
