"use client";

import { ProfileViewToggle } from "@/components/ProfileViewToggle";
import { PuzzleRail } from "@/components/PuzzleRail";
import { WorkCard } from "@/components/WorkCard";
import { useProfileViewMode } from "@/components/useProfileViewMode";
import type { Listing } from "@/lib/discovery/types";
import { collectionHref } from "@/lib/marketplace/collection-slug";
import { saleModeBadge } from "@/lib/marketplace/sale-mode";
import type { ProfileViewId } from "@/lib/profile-view";
import Link from "next/link";
import type { ReactNode } from "react";

export type ProfileCollectionItem = {
  id: string;
  title: string;
  slug?: string | null;
  totalItems: number;
  chain: string;
  coverUrl?: string | null;
};

export type ProfileWorkItem = {
  listing: Listing;
  sold?: boolean;
  emerging?: boolean;
  creatorName?: string;
  creatorAvatarUrl?: string | null;
  showActions?: boolean;
  trackImpression?: boolean;
  canStageRising?: boolean;
  bucket?: string;
  footer?: ReactNode;
  /** Stable React key when listing id alone is not unique (e.g. purchases). */
  key?: string;
};

function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h + id.charCodeAt(i) * 17) % 360;
  return h;
}

function coverStyle(coverUrl: string | null | undefined, id: string) {
  const hue = hueFromId(id);
  if (coverUrl) {
    return {
      backgroundImage: `linear-gradient(180deg, transparent 36%, var(--media-scrim)), url(${coverUrl})`,
      backgroundSize: "cover" as const,
      backgroundPosition: "center" as const,
    };
  }
  return {
    background: `
      linear-gradient(145deg, hsla(${hue}, 45%, 42%, 0.55), transparent 50%),
      linear-gradient(320deg, hsla(${(hue + 40) % 360}, 35%, 35%, 0.4), var(--bg-deep))
    `,
  };
}

function workThumbStyle(listing: Listing) {
  return coverStyle(listing.mediaUrl, listing.id);
}

function priceLabel(listing: Listing, bucket?: string) {
  if (bucket === "sold" && listing.priceUsd != null) {
    return `sold $${listing.priceUsd}`;
  }
  if (listing.priceUsd != null) return `$${listing.priceUsd}`;
  return "timed drop";
}

function WorksLayout({
  view,
  items,
}: {
  view: ProfileViewId;
  items: ProfileWorkItem[];
}) {
  if (items.length === 0) return null;

  if (view === "gallery") {
    return (
      <PuzzleRail className="profile-works-gallery">
        {items.map((item) => (
          <WorkCard
            key={item.key ?? item.listing.id}
            listing={item.listing}
            emerging={item.emerging}
            creatorName={item.creatorName}
            creatorAvatarUrl={item.creatorAvatarUrl}
            showActions={item.showActions}
            sold={item.sold}
            trackImpression={item.trackImpression}
            canStageRising={item.canStageRising}
            bucket={item.bucket}
            footer={item.footer}
          />
        ))}
      </PuzzleRail>
    );
  }

  if (view === "list") {
    return (
      <div className="collections-list profile-works-list">
        {items.map((item) => {
          const { listing } = item;
          return (
            <div key={item.key ?? listing.id} className="profile-works-list__item">
              <Link
                href={`/listings/${listing.id}`}
                className="collections-row"
              >
                <div
                  className="collections-row__thumb"
                  style={workThumbStyle(listing)}
                />
                <span>
                  <strong className="display">{listing.title}</strong>
                  <em>
                    {item.creatorName ? `${item.creatorName} · ` : ""}
                    {listing.network}
                    {listing.type === "auction"
                      ? ` · ${saleModeBadge(listing)}`
                      : ""}
                    {item.sold ? " · sold" : ""}
                  </em>
                </span>
                <span className="collections-row__count">
                  {priceLabel(listing, item.bucket)}
                </span>
              </Link>
              {item.footer ? (
                <div className="profile-works-list__footer">{item.footer}</div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="collection-items-grid profile-works-grid">
      {items.map((item) => (
        <WorkCard
          key={item.key ?? item.listing.id}
          listing={item.listing}
          emerging={item.emerging}
          creatorName={item.creatorName}
          creatorAvatarUrl={item.creatorAvatarUrl}
          showActions={item.showActions}
          sold={item.sold}
          trackImpression={item.trackImpression}
          canStageRising={item.canStageRising}
          bucket={item.bucket}
          footer={item.footer}
        />
      ))}
    </div>
  );
}

function CollectionsLayout({
  view,
  collections,
}: {
  view: ProfileViewId;
  collections: ProfileCollectionItem[];
}) {
  if (collections.length === 0) return null;

  if (view === "list") {
    return (
      <div className="collections-list">
        {collections.map((collection) => (
          <Link
            key={collection.id}
            href={collectionHref(collection)}
            className="collections-row"
          >
            <div
              className="collections-row__thumb"
              style={coverStyle(collection.coverUrl, collection.id)}
            />
            <span>
              <strong className="display">{collection.title}</strong>
              <em>{collection.chain}</em>
            </span>
            <span className="collections-row__count">
              {collection.totalItems} items
            </span>
          </Link>
        ))}
      </div>
    );
  }

  if (view === "gallery") {
    return (
      <div className="profile-collections-gallery">
        {collections.map((collection) => (
          <Link
            key={collection.id}
            href={collectionHref(collection)}
            className="profile-collections-gallery__card"
          >
            <div
              className="profile-collections-gallery__cover"
              style={coverStyle(collection.coverUrl, collection.id)}
            />
            <div className="profile-collections-gallery__body">
              <h3 className="display">{collection.title}</h3>
              <p>
                {collection.chain} · {collection.totalItems} items
              </p>
            </div>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="collections-grid profile-collections-grid">
      {collections.map((collection) => {
        const coverUrl = collection.coverUrl ?? null;
        return (
          <Link
            key={collection.id}
            href={collectionHref(collection)}
            className="collections-card collections-card--profile"
          >
            <div
              className="collections-card__banner"
              style={coverStyle(coverUrl, collection.id)}
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
              <p className="collections-card__byline">{collection.chain}</p>
              <dl className="collections-card__stats">
                <div>
                  <dt>Items</dt>
                  <dd>{collection.totalItems}</dd>
                </div>
              </dl>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Public creator profile catalog: keeps Collections vs Works as separate
 * sections, with a shared gallery / grid / list presentation toggle.
 */
export function ProfileWorksExplorer({
  collections,
  works,
  initialView = "grid",
  emptyWorks,
}: {
  collections: ProfileCollectionItem[];
  works: ProfileWorkItem[];
  initialView?: ProfileViewId;
  emptyWorks?: ReactNode;
}) {
  const { view, select } = useProfileViewMode(initialView);

  return (
    <div className="profile-catalog">
      <div className="profile-catalog__toolbar">
        <p className="profile-catalog__hint">
          Switch how collections and listings appear on this profile.
        </p>
        <ProfileViewToggle view={view} onChange={select} />
      </div>

      {collections.length > 0 ? (
        <section className="me-section profile-catalog__section">
          <h2 className="display me-section__title">
            Collections ({collections.length})
          </h2>
          <CollectionsLayout view={view} collections={collections} />
        </section>
      ) : null}

      <section className="me-section profile-catalog__section">
        <h2 className="display me-section__title">Works ({works.length})</h2>
        {works.length === 0
          ? (emptyWorks ?? (
              <p style={{ color: "var(--ink-muted)" }}>No public listings yet.</p>
            ))
          : (
              <WorksLayout view={view} items={works} />
            )}
      </section>
    </div>
  );
}

/** Shared layout helper for private /me artwork rails. */
export function ProfileArtworkSection({
  title,
  count,
  view,
  items,
  empty,
  walletCards,
}: {
  title: string;
  count: number;
  view: ProfileViewId;
  items?: ProfileWorkItem[];
  empty: ReactNode;
  /** Optional non-listing wallet tiles (grid/gallery only; list falls back to compact rows). */
  walletCards?: ReactNode;
}) {
  return (
    <section className="me-section">
      <h2 className="display me-section__title">
        {title} ({count})
      </h2>
      {count === 0 ? (
        empty
      ) : items ? (
        <WorksLayout view={view} items={items} />
      ) : view === "list" ? (
        walletCards
      ) : view === "gallery" ? (
        <PuzzleRail>{walletCards}</PuzzleRail>
      ) : (
        <div className="collection-items-grid profile-works-grid">{walletCards}</div>
      )}
    </section>
  );
}

export { WorksLayout };
