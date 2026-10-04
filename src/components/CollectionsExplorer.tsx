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
import { collectionHref } from "@/lib/marketplace/collection-slug";
import type { Listing } from "@/lib/discovery/types";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type CollectionBrowseItem = {
  id: string;
  title: string;
  slug?: string | null;
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
      backgroundImage: `linear-gradient(180deg, transparent 36%, var(--media-scrim)), url(${hero.mediaUrl})`,
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
  initialView = "grid",
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
          <h1 className="display collections-head__title">{title}</h1>
          <p className="collections-head__copy">
            {blurb}{" "}
            <Link href="/create">Start a collection</Link>.
          </p>
          <p className="collections-lane-tabs">
            <Link
              href="/collections"
              className={`fm-filter-tab${lane === "top" ? " is-active" : ""}`}
            >
              Top
            </Link>
            <Link
              href="/collections/new"
              className={`fm-filter-tab${lane === "new" ? " is-active" : ""}`}
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
          <section className="fm-empty-state">
            <h2 className="display fm-empty-state__title">
              No collections at the volume bar yet
            </h2>
            <p className="fm-form-note">
              The Top list only shows collections with at least $
              {COLLECTION_INDEX_MIN_VOLUME_USD.toLocaleString()} in completed
              primary sales (including package sales). Browse{" "}
              <Link href="/collections/new">New this week</Link> for fresh sets,
              or open a collection from a creator profile / direct link — those
              still work below the bar.
            </p>
          </section>
        ) : (
          <p className="fm-empty-copy" style={{ marginTop: "1rem" }}>
            No new published collections in the last 7 days.{" "}
            <Link href="/collections">Back to Top</Link>.
          </p>
        )
      ) : null}

      {view === "gallery"
        ? items.map((collection) => (
            <section key={collection.id} className="collections-gallery-block">
              <h2 className="display me-section__title">
                <Link href={collectionHref(collection)}>{collection.title}</Link>
              </h2>
              <p className="me-section__lead">
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
          {items.map((collection) => {
            const hero =
              collection.listings.find(
                (listing) => listing.id === collection.heroListingId,
              ) ?? collection.listings[0];
            const coverUrl = hero?.mediaUrl ?? null;
            return (
              <Link
                key={collection.id}
                href={collectionHref(collection)}
                className="collections-card collections-card--profile"
              >
                <div
                  className="collections-card__banner"
                  style={coverStyle(collection)}
                />
                <div className="collections-card__body">
                  <span
                    className={
                      coverUrl
                        ? "collections-card__avatar collections-card__avatar--media"
                        : "collections-card__avatar"
                    }
                    style={
                      coverUrl
                        ? { backgroundImage: `url(${coverUrl})` }
                        : {
                            background: `linear-gradient(145deg, hsla(${hueFromId(collection.id)}, 55%, 48%, 0.9), hsla(${(hueFromId(collection.id) + 40) % 360}, 40%, 28%, 0.95))`,
                          }
                    }
                    aria-hidden
                  />
                  <h2 className="display">{collection.title}</h2>
                  <p className="collections-card__byline">
                    {collection.creatorName}
                  </p>
                  <dl className="collections-card__stats">
                    <div>
                      <dt>Items</dt>
                      <dd>{collection.totalItems}</dd>
                    </div>
                    <div>
                      <dt>Volume</dt>
                      <dd>
                        {collection.volumeUsd != null && collection.volumeUsd > 0
                          ? `$${Math.round(collection.volumeUsd).toLocaleString()}`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Chain</dt>
                      <dd>{collection.chain}</dd>
                    </div>
                  </dl>
                </div>
              </Link>
            );
          })}
        </div>
      ) : null}

      {view === "list" ? (
        <div className="collections-list">
          {items.map((collection) => (
            <Link
              key={collection.id}
              href={collectionHref(collection)}
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
