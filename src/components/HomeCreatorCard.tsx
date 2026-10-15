import { CreatorAvatar } from "@/components/CreatorAvatar";
import type { CreatorBrowseRow } from "@/lib/marketplace/creators-browse";
import Link from "next/link";

function formatUsd(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function creatorStatsLine(item: CreatorBrowseRow, volumeBit: string | null) {
  return [
    volumeBit,
    item.emerging
      ? "Emerging"
      : item.establishedBadge
        ? "Established"
        : null,
    item.verifiedCreator ? "Verified" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function HomeCreatorCard({ item }: { item: CreatorBrowseRow }) {
  const volumeBit =
    item.source === "trending_7d" && item.volumeUsd7d > 0
      ? `${formatUsd(item.volumeUsd7d)} 7d`
      : item.volumeUsdAllTime > 0
        ? `${formatUsd(item.volumeUsdAllTime)} vol`
        : null;
  const stats = creatorStatsLine(item, volumeBit);

  return (
    <Link href={`/creators/${item.id}`} className="fm-home-creator-card">
      <CreatorAvatar
        id={item.id}
        displayName={item.displayName}
        avatarUrl={item.avatarUrl}
        size={44}
        className="fm-home-creator-card__avatar"
      />
      <div className="fm-home-creator-card__body">
        <div className="fm-home-creator-card__name">{item.displayName}</div>
        <div className="fm-home-creator-card__meta">
          {item.publishedWorks} work{item.publishedWorks === 1 ? "" : "s"}
          {item.collectionCount > 0
            ? ` · ${item.collectionCount} collection${item.collectionCount === 1 ? "" : "s"}`
            : ""}
        </div>
        {stats ? (
          <div className="fm-home-creator-card__stats">{stats}</div>
        ) : null}
      </div>
    </Link>
  );
}
