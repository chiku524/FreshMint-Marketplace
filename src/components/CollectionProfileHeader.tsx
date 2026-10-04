import { CreatorAvatar } from "@/components/CreatorAvatar";
import Link from "next/link";
import type { ReactNode } from "react";

function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h + id.charCodeAt(i) * 17) % 360;
  return h;
}

function formatUsd(n: number | null | undefined): string {
  if (n == null || !(n > 0)) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

export type CollectionProfileHeaderProps = {
  id: string;
  title: string;
  creatorId: string;
  creatorName: string;
  creatorAvatarUrl?: string | null;
  coverUrl?: string | null;
  chain: string;
  itemCount: number;
  floorUsd?: number | null;
  volumeUsd?: number | null;
  badges?: ReactNode;
  actions?: ReactNode;
  description?: string | null;
};

/**
 * OpenSea-inspired collection masthead: banner, overlapping avatar, title, stats.
 * FreshMint theme only — no OpenSea branding.
 */
export function CollectionProfileHeader({
  id,
  title,
  creatorId,
  creatorName,
  creatorAvatarUrl,
  coverUrl,
  chain,
  itemCount,
  floorUsd,
  volumeUsd,
  badges,
  actions,
  description,
}: CollectionProfileHeaderProps) {
  const hue = hueFromId(id);
  const bannerStyle = coverUrl
    ? {
        backgroundImage: `linear-gradient(180deg, transparent 40%, rgba(9,9,11,0.55)), url(${coverUrl})`,
        backgroundSize: "cover" as const,
        backgroundPosition: "center" as const,
      }
    : {
        background: `
          linear-gradient(145deg, hsla(${hue}, 42%, 40%, 0.55), transparent 55%),
          linear-gradient(320deg, hsla(${(hue + 40) % 360}, 32%, 30%, 0.4), var(--bg-deep))
        `,
      };

  return (
    <header className="collection-profile">
      <div className="collection-profile__banner" style={bannerStyle} />
      <div className="collection-profile__body">
        <div className="collection-profile__avatar-wrap">
          {coverUrl ? (
            <span
              className="collection-profile__avatar collection-profile__avatar--media"
              style={{ backgroundImage: `url(${coverUrl})` }}
              role="img"
              aria-label=""
            />
          ) : (
            <CreatorAvatar
              id={creatorId}
              displayName={creatorName}
              avatarUrl={creatorAvatarUrl}
              size={96}
              className="collection-profile__avatar"
            />
          )}
        </div>

        <div className="collection-profile__identity">
          <h1 className="display collection-profile__title">{title}</h1>
          <p className="collection-profile__byline">
            By{" "}
            <Link href={`/creators/${creatorId}`}>{creatorName}</Link>
            {" · "}
            <span className="collection-profile__chain">{chain}</span>
          </p>
          {badges ? (
            <div className="collection-profile__badges">{badges}</div>
          ) : null}
          {description ? (
            <p className="collection-profile__desc">{description}</p>
          ) : null}
        </div>

        <dl className="collection-profile__stats">
          <div>
            <dt>Items</dt>
            <dd>{itemCount}</dd>
          </div>
          <div>
            <dt>Floor</dt>
            <dd>{formatUsd(floorUsd)}</dd>
          </div>
          <div>
            <dt>Volume</dt>
            <dd>{formatUsd(volumeUsd)}</dd>
          </div>
        </dl>

        {actions ? (
          <div className="collection-profile__actions">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
