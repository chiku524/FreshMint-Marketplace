"use client";

import type { Listing } from "@/lib/discovery/types";
import Link from "next/link";
import { useEffect, useState } from "react";

function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h + id.charCodeAt(i) * 17) % 360;
  return h;
}

function formatCountdown(msLeft: number): string {
  if (msLeft <= 0) return "ended";
  const totalSec = Math.floor(msLeft / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 48) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function bidLabel(listing: Listing): string {
  const high = Number(listing.currentHighBidUsd ?? 0) || 0;
  if (high > 0) return `Current $${high.toLocaleString()}`;
  const start = Number(listing.startingBidUsd ?? listing.priceUsd ?? 0) || 0;
  if (start > 0) return `Starting $${start.toLocaleString()}`;
  return "Open bidding";
}

export function EnglishAuctionHomeCard({
  listing,
  creatorName,
}: {
  listing: Listing;
  creatorName?: string;
}) {
  const endsAt = listing.auctionEndsAt ?? 0;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const hue = hueFromId(listing.id);
  const mediaStyle = listing.mediaUrl
    ? {
        backgroundImage: `linear-gradient(180deg, transparent 40%, rgba(9,9,11,0.75)), url(${listing.mediaUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        background: `linear-gradient(145deg, hsla(${hue}, 50%, 40%, 0.55), var(--bg-deep))`,
      };

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="fm-home-auction-card"
      style={mediaStyle}
    >
      <div className="fm-home-auction-card__body">
        <span className="badge" style={{ marginBottom: "0.35rem" }}>
          English auction
        </span>
        <div className="fm-home-auction-card__title">{listing.title}</div>
        <div className="fm-home-auction-card__meta">
          {creatorName ?? listing.creatorId}
        </div>
        <div className="fm-home-auction-card__bid">{bidLabel(listing)}</div>
        <div className="fm-home-auction-card__countdown">
          Ends in {formatCountdown(endsAt - now)}
        </div>
      </div>
    </Link>
  );
}
