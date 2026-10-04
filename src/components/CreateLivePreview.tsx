"use client";

import { BrandMark } from "@/components/MintLeaf";
import { useEffect, useState } from "react";

export type CreateLivePreviewProps = {
  collectionTitle: string;
  network: string;
  intent: "drop" | "single" | "auction" | null;
  dropKind?: "limited" | "open";
  priceUsd: string;
  pieceCount: number;
  heroTitle: string;
  heroDescription: string;
  heroMediaUrl: string;
  satelliteMediaUrls?: string[];
  styleTags: string;
  stepLabel: string;
};

function intentLabel(
  intent: CreateLivePreviewProps["intent"],
  dropKind?: "limited" | "open",
): string {
  if (intent === "drop") {
    return dropKind === "open" ? "Open edition" : "Limited drop";
  }
  if (intent === "auction") return "Timed drop";
  if (intent === "single") return "1/1 listing";
  return "Choose a path";
}

function networkLabel(network: string): string {
  switch (network) {
    case "ethereum":
      return "Ethereum";
    case "base":
      return "Base";
    case "arbitrum":
      return "Arbitrum";
    case "optimism":
      return "Optimism";
    case "solana":
      return "Solana";
    case "boing":
      return "Boing";
    default:
      return network;
  }
}

function hueFromTitle(title: string): number {
  let h = 28;
  for (let i = 0; i < title.length; i += 1) {
    h = (h + title.charCodeAt(i) * 17) % 360;
  }
  return h;
}

/**
 * Animated replica of how the collection / piece will read on FreshMint.
 * Updates live as wizard fields change.
 */
export function CreateLivePreview({
  collectionTitle,
  network,
  intent,
  dropKind,
  priceUsd,
  pieceCount,
  heroTitle,
  heroDescription,
  heroMediaUrl,
  satelliteMediaUrls = [],
  styleTags,
  stepLabel,
}: CreateLivePreviewProps) {
  const title = collectionTitle.trim() || "Untitled collection";
  const piece = heroTitle.trim() || (pieceCount ? "Untitled piece" : "Artwork appears here");
  const blurb =
    heroDescription.trim() ||
    (intent
      ? "Add a short description — collectors see it beside the work."
      : "Name the set, pick a network, then upload art. This stage mirrors the shelf.");
  const tags = styleTags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 3);
  const hue = hueFromTitle(title);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    setPulse((n) => n + 1);
  }, [
    collectionTitle,
    heroTitle,
    heroDescription,
    heroMediaUrl,
    network,
    intent,
    priceUsd,
    pieceCount,
  ]);

  const coverStyle = heroMediaUrl
    ? {
        backgroundImage: `linear-gradient(180deg, transparent 32%, rgba(9,9,11,0.82)), url(${heroMediaUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        background: `
          linear-gradient(145deg, hsla(${hue}, 38%, 38%, 0.5), transparent 52%),
          linear-gradient(320deg, hsla(${(hue + 48) % 360}, 28%, 28%, 0.35), var(--bg-deep))
        `,
      };

  return (
    <div className="create-preview" data-pulse={pulse % 2}>
      <div className="create-preview__atmosphere" aria-hidden="true">
        <span className="create-preview__orb create-preview__orb--a" />
        <span className="create-preview__orb create-preview__orb--b" />
        <span className="create-preview__orb create-preview__orb--c" />
      </div>

      <p className="create-preview__eyebrow">{stepLabel}</p>

      <div className="create-preview__stage">
        <div
          key={`${title}:${heroMediaUrl || "empty"}`}
          className="create-preview__cover"
          style={coverStyle}
        >
          {!heroMediaUrl ? (
            <div className="create-preview__placeholder">
              <span className="create-preview__placeholder-mark" aria-hidden="true" />
              <span>Live preview</span>
            </div>
          ) : null}
          <div className="create-preview__cover-body">
            <div
              key={title}
              className="create-preview__collection display"
            >
              {title}
            </div>
            <div className="create-preview__meta">
              {intentLabel(intent, dropKind)}
              {" · "}
              {networkLabel(network)}
              {pieceCount > 0
                ? ` · ${pieceCount} piece${pieceCount === 1 ? "" : "s"}`
                : null}
            </div>
          </div>
        </div>

        <div key={piece} className="create-preview__piece">
          <p className="create-preview__piece-title display">{piece}</p>
          <p className="create-preview__piece-blurb">{blurb}</p>
          <div className="create-preview__chips">
            {priceUsd && Number(priceUsd) > 0 ? (
              <span className="create-preview__chip create-preview__chip--gold">
                ${Number(priceUsd).toLocaleString()}
              </span>
            ) : null}
            {tags.map((tag) => (
              <span key={tag} className="create-preview__chip">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {satelliteMediaUrls.length > 0 ? (
          <ul className="create-preview__satellites" aria-hidden="true">
            {satelliteMediaUrls.slice(0, 3).map((url, i) => (
              <li
                key={`${url}-${i}`}
                className="create-preview__sat"
                style={{
                  backgroundImage: `url(${url})`,
                  animationDelay: `${0.12 * i}s`,
                }}
              />
            ))}
          </ul>
        ) : null}
      </div>

      <div className="create-preview__brand">
        <BrandMark size={36} showWordmark />
      </div>
    </div>
  );
}
