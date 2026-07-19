"use client";

import type { RankedListing, Listing } from "@/lib/discovery/types";
import Link from "next/link";
import { useState } from "react";
import { ImpressionTracker } from "./ImpressionTracker";
import { ListingActions } from "./ListingActions";

function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 17) % 360;
  return h;
}

export function WorkCard({
  listing,
  emerging,
  bucket,
  score,
  showActions = false,
  creatorName,
  trackImpression = true,
}: {
  listing: Listing;
  emerging?: boolean;
  bucket?: string;
  score?: number;
  showActions?: boolean;
  creatorName?: string;
  trackImpression?: boolean;
}) {
  const hue = hueFromId(listing.id);
  const media = listing.mediaUrl;
  const featured =
    listing.stage === "featured" || bucket === "featured";
  const [spinning, setSpinning] = useState(false);

  const tileClass = [
    "work-tile",
    featured ? "work-tile--featured" : "work-tile--compact",
    !featured && spinning ? "is-spinning" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={tileClass}
      onMouseEnter={() => {
        if (!featured && !spinning) setSpinning(true);
      }}
      onAnimationEnd={(event) => {
        if (
          !featured &&
          event.animationName === "work-card-spin" &&
          event.target === event.currentTarget
        ) {
          setSpinning(false);
        }
      }}
    >
      {trackImpression ? (
        <ImpressionTracker listingId={listing.id} bucket={bucket} />
      ) : null}
      <Link href={`/listings/${listing.id}`} style={{ display: "block" }}>
        <div
          className="work-media"
          style={
            media
              ? {
                  backgroundImage: `linear-gradient(180deg, transparent 40%, rgba(5,8,7,0.88)), url(${media})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : {
                  background: `
            linear-gradient(145deg, hsla(${hue}, 45%, 42%, 0.55), transparent 50%),
            linear-gradient(320deg, hsla(${(hue + 40) % 360}, 35%, 35%, 0.4), #0a100e)
          `,
                }
          }
        />
      </Link>
      <div className="work-tile__body">
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.55rem" }}>
          {emerging ? <span className="badge emerging">Emerging</span> : null}
          {featured ? <span className="badge featured">Featured</span> : null}
          {bucket === "sold" ? (
            <span className="badge featured">Sold</span>
          ) : bucket && bucket !== "featured" ? (
            <span className="badge">{bucket.replace("_", " ")}</span>
          ) : null}
          <span className="badge">{listing.chain}</span>
          <span className="badge">{listing.type.replace("_", " ")}</span>
          {bucket !== "sold" && !featured ? (
            <span className="badge">{listing.stage.replace("_", " ")}</span>
          ) : null}
        </div>
        <h3 className="display work-tile__title">
          <Link href={`/listings/${listing.id}`}>{listing.title}</Link>
        </h3>
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.92rem" }}>
          {creatorName ? (
            <>
              <Link href={`/creators/${listing.creatorId}`}>{creatorName}</Link>
              {" · "}
            </>
          ) : null}
          {listing.medium}
          {bucket === "sold" && listing.priceUsd != null
            ? ` · sold $${listing.priceUsd}`
            : listing.priceUsd != null
              ? ` · $${listing.priceUsd}`
              : " · auction"}
          {score != null ? ` · score ${score.toFixed(1)}` : ""}
        </p>
        {showActions ? (
          <ListingActions
            listingId={listing.id}
            creatorId={listing.creatorId}
            priceUsd={listing.priceUsd}
            stage={listing.stage}
          />
        ) : null}
      </div>
    </article>
  );
}

export function RankedWorkCard({
  item,
  showActions = true,
  creatorName,
}: {
  item: RankedListing;
  showActions?: boolean;
  creatorName?: string;
}) {
  return (
    <WorkCard
      listing={item.listing}
      emerging={item.emerging}
      bucket={String(item.bucket)}
      score={item.score}
      showActions={showActions}
      creatorName={creatorName}
    />
  );
}
