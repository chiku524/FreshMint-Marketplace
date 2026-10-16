import { PuzzleRail } from "@/components/PuzzleRail";
import { RankedWorkCard, WorkCard } from "@/components/WorkCard";
import { FEATURED_BOOST_USD } from "@/lib/fees/featured-boost";
import { selectBoostedFeatured } from "@/lib/marketplace/featured-boost";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Featured",
  description:
    "Curated Featured slots and paid Promoted boosts — never mixed into Rising or Open Lane quotas.",
};

export default async function FeaturedPage() {
  const engine = await getDiscoveryEngine();
  const featured = engine.buildFeatured();
  const boosted = selectBoostedFeatured(engine.state.listings.values());
  const editorialIds = new Set(featured.map((item) => item.listing.id));
  const boostedOnly = boosted.filter((l) => !editorialIds.has(l.id));
  const promoted = boostedOnly.length > 0 ? boostedOnly : boosted;

  return (
    <div className="page-wrap">
      <header className="page-lead">
        <h1 className="display page-lead__title">Featured</h1>
        <p className="page-lead__copy">
          Works our editors love, plus clearly labeled promoted placements.
          Promotion never affects Rising or the Open Lane.
        </p>
      </header>

      <section style={{ marginBottom: "2.75rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.4rem", fontSize: "1.35rem" }}>
          Promoted ({boosted.length})
        </h2>
        <p
          style={{
            color: "var(--ink-muted)",
            margin: "0 0 1rem",
            maxWidth: "48ch",
            fontSize: "0.9rem",
          }}
        >
          Creators can promote a published work for ${FEATURED_BOOST_USD} from its
          listing page. Promoted works are always labeled.
        </p>
        {boosted.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            No promoted works right now.
          </p>
        ) : (
          <PuzzleRail>
            {promoted.map((listing) => (
              <WorkCard
                key={listing.id}
                listing={listing}
                bucket="featured"
                showActions
                creatorName={
                  engine.state.creators.get(listing.creatorId)?.displayName
                }
                creatorAvatarUrl={
                  engine.state.creators.get(listing.creatorId)?.avatarUrl
                }
                collection={
                  listing.collectionId
                    ? engine.state.collections.get(listing.collectionId) ?? null
                    : null
                }
                footer={<>Promoted</>}
              />
            ))}
          </PuzzleRail>
        )}
      </section>

      <section>
        <h2 className="display" style={{ margin: "0 0 0.4rem", fontSize: "1.35rem" }}>
          Editorial picks ({featured.length})
        </h2>
        <p
          style={{
            color: "var(--ink-muted)",
            margin: "0 0 1rem",
            maxWidth: "48ch",
            fontSize: "0.9rem",
          }}
        >
          Hand-picked by the FreshMint team.
        </p>
        {featured.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            No editor picks today. Browse{" "}
            <Link href="/rising">Rising</Link> or the{" "}
            <Link href="/open">Open Lane</Link>.
          </p>
        ) : (
          <PuzzleRail>
            {featured.map((item) => (
              <RankedWorkCard
                key={item.listing.id}
                item={item}
                creatorName={
                  engine.state.creators.get(item.listing.creatorId)?.displayName
                }
                creatorAvatarUrl={
                  engine.state.creators.get(item.listing.creatorId)?.avatarUrl
                }
              />
            ))}
          </PuzzleRail>
        )}
      </section>
    </div>
  );
}
