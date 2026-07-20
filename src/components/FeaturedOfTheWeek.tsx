import { getFeaturedOfTheWeek } from "@/lib/marketplace/featured-week";
import Link from "next/link";

function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 17) % 360;
  return h;
}

export async function FeaturedOfTheWeek() {
  const spot = await getFeaturedOfTheWeek();
  if (!spot) return null;

  const { listing, creatorName, weekLabel } = spot;
  const hue = hueFromId(listing.id);
  const media = listing.mediaUrl;

  return (
    <aside className="fm-featured-week" aria-label="Featured artwork of the week">
      <Link href={`/listings/${listing.id}`} className="fm-featured-week__link">
        <div
          className="fm-featured-week__media"
          style={
            media
              ? {
                  backgroundImage: `url(${media})`,
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
        <div className="fm-featured-week__meta">
          <span className="fm-featured-week__eyebrow">Featured this week</span>
          <span className="display fm-featured-week__title">{listing.title}</span>
          <span className="fm-featured-week__by">
            {creatorName}
            {listing.priceUsd != null ? ` · $${listing.priceUsd}` : ""}
          </span>
          <span className="fm-featured-week__week">{weekLabel}</span>
        </div>
      </Link>
    </aside>
  );
}
