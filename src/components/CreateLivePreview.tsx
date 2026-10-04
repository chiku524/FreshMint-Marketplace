"use client";

import { BrandMark } from "@/components/MintLeaf";
import Link from "next/link";
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
  return "New collection";
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
 * Animated live preview of the OpenSea-like collection profile
 * collectors will see — updates as wizard fields change.
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
  const piece =
    heroTitle.trim() || (pieceCount ? "Untitled piece" : "Your first work");
  const blurb =
    heroDescription.trim() ||
    (intent
      ? "Add a short description — it appears under the collection masthead."
      : "Name the set and upload art. This stage mirrors the collection page.");
  const tags = styleTags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 3);
  const hue = hueFromTitle(title);
  const floor =
    priceUsd && Number(priceUsd) > 0
      ? `$${Number(priceUsd).toLocaleString()}`
      : "—";
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

  const bannerStyle = heroMediaUrl
    ? {
        backgroundImage: `linear-gradient(180deg, transparent 42%, var(--media-scrim-soft)), url(${heroMediaUrl})`,
        backgroundSize: "cover" as const,
        backgroundPosition: "center" as const,
      }
    : {
        background: `
          linear-gradient(145deg, hsla(${hue}, 38%, 38%, 0.5), transparent 52%),
          linear-gradient(320deg, hsla(${(hue + 48) % 360}, 28%, 28%, 0.35), var(--bg-deep))
        `,
      };

  const thumbUrls = [heroMediaUrl, ...satelliteMediaUrls].filter(Boolean);

  return (
    <div className="create-preview" data-pulse={pulse % 2}>
      <div className="create-preview__atmosphere" aria-hidden="true">
        <span className="create-preview__orb create-preview__orb--a" />
        <span className="create-preview__orb create-preview__orb--b" />
        <span className="create-preview__orb create-preview__orb--c" />
      </div>

      <div className="create-preview__top">
        <Link href="/" className="create-preview__exit">
          ← Marketplace
        </Link>
        <p className="create-preview__eyebrow">{stepLabel}</p>
      </div>

      <div className="create-preview__stage create-preview__stage--profile">
        <div
          key={`${title}:${heroMediaUrl || "empty"}`}
          className="create-preview__profile"
        >
          <div className="create-preview__banner" style={bannerStyle}>
            {!heroMediaUrl ? (
              <div className="create-preview__placeholder">
                <span
                  className="create-preview__placeholder-mark"
                  aria-hidden="true"
                />
                <span>Collection cover</span>
              </div>
            ) : null}
          </div>

          <div className="create-preview__profile-body">
            <div
              key={heroMediaUrl || "avatar"}
              className={
                heroMediaUrl
                  ? "create-preview__avatar create-preview__avatar--media"
                  : "create-preview__avatar"
              }
              style={
                heroMediaUrl
                  ? { backgroundImage: `url(${heroMediaUrl})` }
                  : undefined
              }
              aria-hidden="true"
            />

            <div key={title} className="create-preview__identity">
              <p className="create-preview__collection display">{title}</p>
              <p className="create-preview__meta">
                {intentLabel(intent, dropKind)}
                {" · "}
                {networkLabel(network)}
              </p>
            </div>

            <dl className="create-preview__stats">
              <div>
                <dt>Items</dt>
                <dd>{pieceCount || "—"}</dd>
              </div>
              <div>
                <dt>Floor</dt>
                <dd>{floor}</dd>
              </div>
              <div>
                <dt>Volume</dt>
                <dd>—</dd>
              </div>
            </dl>

            <div key={piece} className="create-preview__piece">
              <p className="create-preview__piece-title display">{piece}</p>
              <p className="create-preview__piece-blurb">{blurb}</p>
              {tags.length ? (
                <div className="create-preview__chips">
                  {tags.map((tag) => (
                    <span key={tag} className="create-preview__chip">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {thumbUrls.length > 0 ? (
              <ul className="create-preview__item-strip" aria-hidden="true">
                {thumbUrls.slice(0, 4).map((url, i) => (
                  <li
                    key={`${url}-${i}`}
                    className="create-preview__item-thumb"
                    style={{
                      backgroundImage: `url(${url})`,
                      animationDelay: `${0.1 * i}s`,
                    }}
                  />
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>

      <div className="create-preview__brand">
        <BrandMark size={32} showWordmark />
      </div>
    </div>
  );
}
