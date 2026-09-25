import type { CreatorBrowseRow } from "@/lib/marketplace/creators-browse";
import Link from "next/link";

function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h + id.charCodeAt(i) * 17) % 360;
  return h;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

function formatUsd(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export function HomeCreatorCard({ item }: { item: CreatorBrowseRow }) {
  const hue = hueFromId(item.id);
  const volumeBit =
    item.source === "trending_7d" && item.volumeUsd7d > 0
      ? `${formatUsd(item.volumeUsd7d)} 7d`
      : item.volumeUsdAllTime > 0
        ? `${formatUsd(item.volumeUsdAllTime)} vol`
        : null;

  return (
    <Link href={`/creators/${item.id}`} className="fm-home-creator-card">
      <div
        className="fm-home-creator-card__avatar"
        style={{
          background: `linear-gradient(145deg, hsla(${hue}, 55%, 48%, 0.9), hsla(${(hue + 40) % 360}, 40%, 28%, 0.95))`,
        }}
        aria-hidden
      >
        {initials(item.displayName)}
      </div>
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
