import { PuzzleRail } from "@/components/PuzzleRail";
import { WorkCard } from "@/components/WorkCard";
import { rankTrendingListings } from "@/lib/marketplace/trending";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Trending NFTs — FreshMint Marketplace",
  description:
    "Public works ordered by recorded page views, saves, and unique viewers.",
};

export default async function TrendingPage() {
  const engine = await getDiscoveryEngine();
  const ranked = rankTrendingListings(engine.state.listings.values());

  return (
    <div className="page-wrap">
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Trending NFTs
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "54ch", marginBottom: "1.75rem" }}>
        Public works ordered by recorded page views, then saves, then unique
        viewers. Those counters already live on each listing — this lane does
        not invent a separate trend score.
      </p>
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
