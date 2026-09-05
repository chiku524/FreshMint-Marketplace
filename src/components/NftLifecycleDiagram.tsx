"use client";

import { PLATFORM_FEE_PERCENT } from "@/lib/fees/platform";
import { MintLeaf } from "@/components/MintLeaf";
import { useEffect, useId, useState } from "react";

type Step = {
  id: string;
  title: string;
  lane: string;
  realm: "ledger" | "chain";
  optional?: boolean;
  x: number;
  y: number;
  body: string;
};

const VB_W = 1000;
const VB_H = 440;
const STEP_MS = 3400;

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

const STEPS: Step[] = [
  {
    id: "signin",
    title: "Sign in",
    lane: "You",
    realm: "ledger",
    x: 90,
    y: 88,
    body: "Google, email, a wallet, or a demo persona. Creating and buying never ask you to sign a chain transaction.",
  },
  {
    id: "collection",
    title: "Collection",
    lane: "Creator",
    realm: "ledger",
    optional: true,
    x: 310,
    y: 88,
    body: "Name a collection and pick the network a collector would mint on later. Skip this and list a standalone work.",
  },
  {
    id: "list",
    title: "List or drop",
    lane: "Creator",
    realm: "ledger",
    x: 560,
    y: 88,
    body: "A 1/1, a collection piece, a timed open edition, or an auction. Soft-launch to Open Lane. Media is hashed. Nothing is minted.",
  },
  {
    id: "discover",
    title: "Discover",
    lane: "Market",
    realm: "ledger",
    x: 760,
    y: 88,
    body: "The work opens in Open Lane. Saves, follows, and page views raise its score. Rising and Featured are scarce slots — not automatic.",
  },
  {
    id: "buy",
    title: "Buy",
    lane: "Collector",
    realm: "ledger",
    x: 760,
    y: 228,
    body: `The collector pays the listed USD. FreshMint takes ${PLATFORM_FEE_PERCENT.total}% for the treasury; the seller keeps ${PLATFORM_FEE_PERCENT.sellerNet}%. A 1/1 sells once. An open edition can sell again.`,
  },
  {
    id: "collect",
    title: "Collect",
    lane: "Collector",
    realm: "ledger",
    x: 500,
    y: 228,
    body: "The work sits on the collector’s profile — still a FreshMint record. No wallet, no gas, no token yet.",
  },
  {
    id: "withdraw",
    title: "Withdraw",
    lane: "Chain",
    realm: "chain",
    optional: true,
    x: 220,
    y: 368,
    body: "Link a matching wallet and sign. That is the first mint — on EVM, Solana, or Boing. Gas is only on this step.",
  },
];

export function NftLifecycleDiagram() {
  const steps = STEPS;
  const last = steps.length - 1;
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const reactId = useId();
  const captionId = `${reactId}-caption`;
  const headingId = `${reactId}-heading`;
  const step = steps[index];
  const minted = step.realm === "chain";

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

  return (
    <div
      className="nft-flow"
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
          <p className="nft-flow__kicker">The life of a work</p>
          <h3 id={headingId} className="display nft-flow__title">
            From collection to mint
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
        <span className="nft-flow__legend-item is-ledger">On FreshMint</span>
        <span className="nft-flow__legend-item is-chain">On-chain, if you choose</span>
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
              <stop offset="70%" stopColor="#d4ae66" />
              <stop offset="100%" stopColor="#c9953a" />
            </linearGradient>
          </defs>
          <rect
            className="nft-flow__realm nft-flow__realm--ledger"
            x="24"
            y="24"
            width="952"
            height="280"
            rx="18"
          />
          <rect
            className="nft-flow__realm nft-flow__realm--chain"
            x="24"
            y="316"
            width="952"
            height="100"
            rx="18"
          />
          <text className="nft-flow__realm-label" x="44" y="52">
            Platform ledger
          </text>
          <text className="nft-flow__realm-label is-chain" x="44" y="344">
            Wallet mint
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
        </svg>

        {steps.map((node, i) => (
          <button
            key={node.id}
            type="button"
            className={`nft-flow__node${i === index ? " is-active" : ""}${i < index ? " is-done" : ""}${node.realm === "chain" ? " is-chain" : ""}`}
            style={{
              left: `${(node.x / VB_W) * 100}%`,
              top: `${(node.y / VB_H) * 100}%`,
            }}
            aria-current={i === index ? "step" : undefined}
            onClick={() => goTo(i)}
          >
            <span className="nft-flow__dot" />
            <span className="nft-flow__node-copy">
              <span className="nft-flow__lane">
                {node.lane}
                {node.optional ? " · optional" : ""}
              </span>
              <span className="nft-flow__node-title">{node.title}</span>
            </span>
          </button>
        ))}

        <div
          className={`nft-flow__token${minted ? " is-minted" : " is-ledger"}`}
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
              className={`nft-flow__rail-step${i === index ? " is-active" : ""}${node.realm === "chain" ? " is-chain" : ""}`}
              onClick={() => goTo(i)}
            >
              <span className="nft-flow__rail-index">{i + 1}</span>
              <span>
                <strong>{node.title}</strong>
                {node.optional ? <em> optional</em> : null}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="nft-flow__caption" id={captionId} aria-live="polite">
        <p className="nft-flow__caption-lane">
          {step.lane}
          {step.optional ? " · optional" : ""}
          {" · "}
          {minted ? "On-chain NFT" : "Off-chain record"}
        </p>
        <p className="display nft-flow__caption-title">{step.title}</p>
        <p className="nft-flow__caption-body">{step.body}</p>
        <p className="nft-flow__aside">
          ETH, SOL, and Boing move on the bridge. That path moves funds — it does
          not mint the art.
        </p>
      </div>
    </div>
  );
}
