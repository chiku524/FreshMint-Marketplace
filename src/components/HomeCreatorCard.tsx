import { CreatorAvatar } from "@/components/CreatorAvatar";
import type { CreatorBrowseRow } from "@/lib/marketplace/creators-browse";
import Link from "next/link";

function formatUsd(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export function HomeCreatorCard({ item }: { item: CreatorBrowseRow }) {
  const volumeBit =
    item.source === "trending_7d" && item.volumeUsd7d > 0
      ? `${formatUsd(item.volumeUsd7d)} 7d`
      : item.volumeUsdAllTime > 0
        ? `${formatUsd(item.volumeUsdAllTime)} vol`
        : null;

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
        {volumeBit ? (
          <div className="fm-home-creator-card__stats">{volumeBit}</div>
        ) : null}
        <div className="fm-home-creator-card__badges">
          {item.emerging ? <span className="badge emerging">Emerging</span> : null}
          {item.establishedBadge ? (
            <span className="badge featured">Established</span>
          ) : null}
          {item.verifiedCreator ? <span className="badge">Verified</span> : null}
        </div>
      </div>
    </Link>
  );
}
