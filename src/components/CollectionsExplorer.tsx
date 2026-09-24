"use client";

import { PuzzleRail } from "@/components/PuzzleRail";
import { WorkCard } from "@/components/WorkCard";
import {
  COLLECTIONS_VIEW_COOKIE,
  COLLECTIONS_VIEWS,
  parseCollectionsView,
  type CollectionsViewId,
} from "@/lib/collections-view";
import {
  COLLECTION_INDEX_MIN_VOLUME_USD,
} from "@/lib/marketplace/collections-browse-config";
import type { Listing } from "@/lib/discovery/types";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type CollectionBrowseItem = {
  id: string;
  title: string;
  creatorId: string;
  creatorName: string;
  chain: string;
  totalItems: number;
  heroListingId: string | null;
  listings: Listing[];
  volumeUsd?: number;
  createdAt?: number | null;
};

function persistView(next: CollectionsViewId) {
  try {
    window.localStorage.setItem(COLLECTIONS_VIEW_COOKIE, next);
    document.cookie = `${COLLECTIONS_VIEW_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    // preference is session-only
  }
}

function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h + id.charCodeAt(i) * 17) % 360;
  return h;
}

function coverStyle(item: CollectionBrowseItem) {
  const hero =
    item.listings.find((listing) => listing.id === item.heroListingId) ??
    item.listings[0];
  const hue = hueFromId(item.id);
  if (hero?.mediaUrl) {
    return {
      backgroundImage: `linear-gradient(180deg, transparent 36%, rgba(9,9,11,0.72)), url(${hero.mediaUrl})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return {
    background: `
      linear-gradient(145deg, hsla(${hue}, 45%, 42%, 0.55), transparent 50%),
      linear-gradient(320deg, hsla(${(hue + 40) % 360}, 35%, 35%, 0.4), var(--bg-deep))
    `,
  };
}

function formatVolume(volumeUsd: number | undefined) {
  if (volumeUsd == null) return null;
  return `$${Math.round(volumeUsd).toLocaleString()} volume`;
}

function ViewIcon({ name }: { name: CollectionsViewId }) {
  return (
    <svg
      className="collections-view-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {name === "gallery" ? (
        <>
          <rect x="3.5" y="4.5" width="10" height="10" rx="1.4" />
          <rect x="15.2" y="4.5" width="5.3" height="4.6" rx="1" />
          <rect x="15.2" y="10.7" width="5.3" height="3.8" rx="1" />
          <rect x="3.5" y="16.2" width="17" height="3.3" rx="1" />
        </>
      ) : null}
      {name === "grid" ? (
        <>
          <rect x="4" y="4" width="6.4" height="6.4" rx="1" />
          <rect x="13.6" y="4" width="6.4" height="6.4" rx="1" />
          <rect x="4" y="13.6" width="6.4" height="6.4" rx="1" />
          <rect x="13.6" y="13.6" width="6.4" height="6.4" rx="1" />
        </>
      ) : null}
      {name === "list" ? (
        <>
          <path d="M8.5 7H20" />
          <path d="M8.5 12H20" />
          <path d="M8.5 17H20" />
          <rect x="3.6" y="5.6" width="2.6" height="2.6" rx="0.5" />
          <rect x="3.6" y="10.6" width="2.6" height="2.6" rx="0.5" />
          <rect x="3.6" y="15.6" width="2.6" height="2.6" rx="0.5" />
        </>
      ) : null}
    </svg>
  );
}

export function CollectionsExplorer({
  items,
  soldIds,
  initialView = "gallery",
  lane = "top",
  children,
}: {
  items: CollectionBrowseItem[];
  soldIds: string[];
  initialView?: CollectionsViewId;
  /** Which browse lane is active — drives tabs + empty copy. */
  lane?: "top" | "new";
  children?: ReactNode;
}) {
  const [view, setView] = useState<CollectionsViewId>(initialView);
  const viewRef = useRef(view);
  viewRef.current = view;
  const sold = new Set(soldIds);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLLECTIONS_VIEW_COOKIE);
      const next = stored ? parseCollectionsView(stored) : viewRef.current;
      if (next !== viewRef.current) setView(next);
      persistView(next);
    } catch {
      // keep the server view
    }
  }, []);

  const select = (next: CollectionsViewId) => {
    setView(next);
    persistView(next);
  };

  const title = lane === "new" ? "New collections" : "Collections";
  const blurb =
    lane === "new"
      ? "Collections created in the last 7 days with at least one published work — newest first."
      : `Creator-owned sets with at least $${COLLECTION_INDEX_MIN_VOLUME_USD.toLocaleString()} all-time completed primary volume.`;

  return (
    <>
      <div className="collections-head">
        <div>
          <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
            {title}
          </h1>
          <p style={{ color: "var(--ink-muted)", maxWidth: "52ch", margin: 0 }}>
            {blurb}{" "}
            <Link href="/create">Start a collection</Link>.
          </p>
          <p
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.45rem",
              margin: "0.85rem 0 0",
            }}
          >
            <Link
              href="/collections"
              className={`badge${lane === "top" ? " featured" : ""}`}
            >
              Top
            </Link>
            <Link
              href="/collections/new"
              className={`badge${lane === "new" ? " featured" : ""}`}
            >
              New this week
            </Link>
          </p>
        </div>
        <div className="collections-views" role="toolbar" aria-label="Collection view">
          {COLLECTIONS_VIEWS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={view === option.id ? "is-active" : undefined}
              aria-pressed={view === option.id}
              onClick={() => select(option.id)}
            >
              <ViewIcon name={option.id} />
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {children}
      {items.length === 0 ? (
        lane === "top" ? (
          <section
            style={{
              marginTop: "1.25rem",
              border: "1px solid var(--line)",
              padding: "1.1rem 1.15rem",
              background: "var(--panel)",
              maxWidth: "40rem",
            }}
          >
            <h2 className="display" style={{ margin: "0 0 0.45rem", fontSize: "1.25rem" }}>
              No collections at the volume bar yet
            </h2>
            <p style={{ margin: 0, color: "var(--ink-muted)", lineHeight: 1.55 }}>
              The Top list only shows collections with at least $
              {COLLECTION_INDEX_MIN_VOLUME_USD.toLocaleString()} in completed
              primary sales (including package sales). Browse{" "}
              <Link href="/collections/new">New this week</Link> for fresh sets,
              or open a collection from a creator profile / direct link — those
              still work below the bar.
            </p>
          </section>
        ) : (
          <p style={{ color: "var(--ink-muted)", marginTop: "1rem" }}>
            No new published collections in the last 7 days.{" "}
            <Link href="/collections">Back to Top</Link>.
          </p>
        )
      ) : null}

      {view === "gallery"
        ? items.map((collection) => (
            <section key={collection.id} className="collections-gallery-block">
              <h2 className="display" style={{ margin: "0 0 0.35rem", fontSize: "1.5rem" }}>
                <Link href={`/collections/${collection.id}`}>{collection.title}</Link>
              </h2>
              <p style={{ margin: "0 0 1rem", color: "var(--ink-muted)" }}>
                {collection.creatorName} · {collection.chain} · {collection.totalItems}{" "}
                items
                {formatVolume(collection.volumeUsd)
                  ? ` · ${formatVolume(collection.volumeUsd)}`
                  : ""}
              </p>
              {collection.listings.length ? (
                <PuzzleRail>
                  {collection.listings.map((listing) => (
                    <WorkCard
                      key={listing.id}
                      listing={listing}
                      showActions
                      sold={sold.has(listing.id)}
                      creatorName={collection.creatorName}
                    />
                  ))}
                </PuzzleRail>
              ) : (
                <p style={{ color: "var(--ink-muted)" }}>No pieces yet.</p>
              )}
            </section>
          ))
        : null}

      {view === "grid" ? (
        <div className="collections-grid">
          {items.map((collection) => (
            <Link
              key={collection.id}
              href={`/collections/${collection.id}`}
              className="collections-card"
            >
              <div className="collections-card__cover" style={coverStyle(collection)} />
              <div className="collections-card__body">
                <h2 className="display">{collection.title}</h2>
                <p>
                  {collection.creatorName} · {collection.chain} ·{" "}
                  {collection.totalItems} items
                  {formatVolume(collection.volumeUsd)
                    ? ` · ${formatVolume(collection.volumeUsd)}`
                    : ""}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      {view === "list" ? (
        <div className="collections-list">
          {items.map((collection) => (
            <Link
              key={collection.id}
              href={`/collections/${collection.id}`}
              className="collections-row"
            >
              <div className="collections-row__thumb" style={coverStyle(collection)} />
              <span>
                <strong className="display">{collection.title}</strong>
                <em>
                  {collection.creatorName} · {collection.chain}
                  {formatVolume(collection.volumeUsd)
                    ? ` · ${formatVolume(collection.volumeUsd)}`
                    : ""}
                </em>
              </span>
              <span className="collections-row__count">
                {collection.totalItems} items
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </>
  );
}
