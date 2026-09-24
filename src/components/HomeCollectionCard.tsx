import type { HomeCollectionCardModel } from "@/lib/marketplace/home-discovery";
import Link from "next/link";

function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h + id.charCodeAt(i) * 17) % 360;
  return h;
}

function coverStyle(item: HomeCollectionCardModel) {
  const hue = hueFromId(item.id);
  if (item.coverUrl) {
    return {
      backgroundImage: `linear-gradient(180deg, transparent 36%, rgba(9,9,11,0.72)), url(${item.coverUrl})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    } as const;
  }
  return {
    background: `
      linear-gradient(145deg, hsla(${hue}, 45%, 42%, 0.55), transparent 50%),
      linear-gradient(320deg, hsla(${(hue + 40) % 360}, 35%, 35%, 0.4), var(--bg-deep))
    `,
  } as const;
}

function formatUsd(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export function HomeCollectionCard({ item }: { item: HomeCollectionCardModel }) {
  const volumeBit =
    item.volumeUsd > 0
      ? `${formatUsd(item.volumeUsd)} ${item.volumeLabel === "7d" ? "7d" : "vol"}`
      : null;
  const floorBit =
    item.floorUsd != null && item.floorUsd > 0
      ? `floor ${formatUsd(item.floorUsd)}`
      : null;

  return (
    <Link
      href={`/collections/${item.id}`}
      className="fm-home-collection-card"
      style={coverStyle(item)}
    >
      <div className="fm-home-collection-card__body">
        <div className="fm-home-collection-card__title">{item.title}</div>
        <div className="fm-home-collection-card__meta">
          {item.creatorName}
          {" · "}
          {item.totalItems} item{item.totalItems === 1 ? "" : "s"}
        </div>
        {(volumeBit || floorBit) && (
          <div className="fm-home-collection-card__stats">
            {[volumeBit, floorBit].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
    </Link>
  );
}
