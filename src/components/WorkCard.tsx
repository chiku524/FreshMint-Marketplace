import type { RankedListing } from "@/lib/discovery/types";
import type { Listing } from "@/lib/discovery/types";

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
}: {
  listing: Listing;
  emerging?: boolean;
  bucket?: string;
  score?: number;
}) {
  const hue = hueFromId(listing.id);
  return (
    <article className="work-tile">
      <div
        className="work-media"
        style={{
          background: `
            linear-gradient(145deg, hsla(${hue}, 45%, 42%, 0.55), transparent 50%),
            linear-gradient(320deg, hsla(${(hue + 40) % 360}, 35%, 35%, 0.4), #102820)
          `,
        }}
      />
      <div style={{ padding: "0.9rem 1rem 1.1rem" }}>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.55rem" }}>
          {emerging ? <span className="badge emerging">Emerging</span> : null}
          {bucket ? <span className="badge">{bucket.replace("_", " ")}</span> : null}
          <span className="badge">{listing.chain}</span>
          <span className="badge">{listing.type.replace("_", " ")}</span>
        </div>
        <h3 className="display" style={{ margin: "0 0 0.25rem", fontSize: "1.15rem" }}>
          {listing.title}
        </h3>
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.92rem" }}>
          {listing.medium}
          {listing.priceUsd != null ? ` · $${listing.priceUsd}` : " · auction"}
          {score != null ? ` · score ${score.toFixed(1)}` : ""}
        </p>
      </div>
    </article>
  );
}

export function RankedWorkCard({ item }: { item: RankedListing }) {
  return (
    <WorkCard
      listing={item.listing}
      emerging={item.emerging}
      bucket={String(item.bucket)}
      score={item.score}
    />
  );
}
