import { HowItWorksNote } from "@/components/HowItWorksNote";
import { PuzzleRail } from "@/components/PuzzleRail";
import { WorkCard } from "@/components/WorkCard";
import { listClosedPrimarySaleIds } from "@/lib/marketplace/sales";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const engine = await getDiscoveryEngine();
  const soldIds = await listClosedPrimarySaleIds();
  const collections = [...engine.state.collections.values()];

  return (
    <div className="page-wrap">
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Collections
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "52ch", marginBottom: "0.75rem" }}>
        Creator-owned sets. <Link href="/create">Start a collection</Link>.
      </p>
      <HowItWorksNote kind="create" />
      {collections.length === 0 ? (
        <p style={{ color: "var(--ink-muted)" }}>No collections yet.</p>
      ) : null}
      {collections.map((collection) => {
        const surface = engine.getCollectionSurface(collection.id);
        const creator = engine.state.creators.get(collection.creatorId);
        const listings = surface?.listings ?? [];
        return (
          <section key={collection.id} style={{ marginBottom: "2.5rem" }}>
            <h2 className="display" style={{ margin: "0 0 0.35rem", fontSize: "1.5rem" }}>
              <Link href={`/collections/${collection.id}`}>{collection.title}</Link>
            </h2>
            <p style={{ margin: "0 0 1rem", color: "var(--ink-muted)" }}>
              {creator?.displayName ?? collection.creatorId} · {collection.chain} ·{" "}
              {collection.totalItems} items
            </p>
            {listings.length ? (
              <PuzzleRail>
                {listings.map((listing) => (
                  <WorkCard
                    key={listing.id}
                    listing={listing}
                    showActions
                    sold={soldIds.has(listing.id)}
                    creatorName={creator?.displayName}
                  />
                ))}
              </PuzzleRail>
            ) : (
              <p style={{ color: "var(--ink-muted)" }}>No pieces yet.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
