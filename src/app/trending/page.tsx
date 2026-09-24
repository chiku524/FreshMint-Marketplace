import { PuzzleRail } from "@/components/PuzzleRail";
import { WorkCard } from "@/components/WorkCard";
import { rankTrendingListings } from "@/lib/marketplace/trending";
import { trendingCollectionsFromRanked } from "@/lib/marketplace/trending-collections";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Most viewed — FreshMint Marketplace",
  description:
    "Public works ordered by recorded page views, saves, and unique viewers.",
};

export default async function TrendingPage() {
  const engine = await getDiscoveryEngine();
  const ranked = rankTrendingListings(engine.state.listings.values());
  const collectionStrip = trendingCollectionsFromRanked(
    ranked,
    engine.state.collections,
    8,
  );

  return (
    <div className="page-wrap">
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Most viewed
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "54ch", marginBottom: "1.75rem" }}>
        Public works ordered by recorded page views, then saves, then unique
        viewers. Those counters already live on each listing — this lane does
        not invent a separate trend score.
      </p>

      {collectionStrip.length > 0 ? (
        <section style={{ marginBottom: "1.75rem" }}>
          <h2 className="display" style={{ margin: "0 0 0.55rem", fontSize: "1.15rem" }}>
            Trending collections
          </h2>
          <p style={{ margin: "0 0 0.75rem", color: "var(--ink-muted)", fontSize: "0.88rem" }}>
            Derived from the ranked grid below — grouped by collection, no extra
            backend score.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
            {collectionStrip.map((item) => (
              <Link
                key={item.collection.id}
                href={`/collections/${item.collection.id}`}
                className="badge"
                style={{ textDecoration: "none" }}
              >
                {item.collection.title}
                <span style={{ opacity: 0.7 }}>
                  {" "}
                  · {item.listingCount} work{item.listingCount === 1 ? "" : "s"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {ranked.length === 0 ? (
        <p style={{ color: "var(--ink-muted)" }}>
          Nothing has recorded attention yet. Browse the{" "}
          <Link href="/open">Open Lane</Link> or <Link href="/rising">Rising</Link>.
        </p>
      ) : (
        <PuzzleRail>
          {ranked.map((listing) => (
            <WorkCard
              key={listing.id}
              listing={listing}
              showActions
              creatorName={
                engine.state.creators.get(listing.creatorId)?.displayName
              }
              collection={
                listing.collectionId
                  ? engine.state.collections.get(listing.collectionId) ?? null
                  : null
              }
              footer={
                <>
                  {listing.signals.pageViews} page views · {listing.signals.saves}{" "}
                  saves · {listing.signals.uniqueViewers} viewers
                </>
              }
            />
          ))}
        </PuzzleRail>
      )}
    </div>
  );
}
