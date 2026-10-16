import { EmptyState } from "@/components/EmptyState";
import { PuzzleRail } from "@/components/PuzzleRail";
import { WorkCard } from "@/components/WorkCard";
import { listClosedPrimarySaleIds } from "@/lib/marketplace/sales";
import { getDiscoveryEngine } from "@/lib/marketplace/service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Collector shelves",
  description:
    "Named collector curations that amplify emerging work others can follow.",
};

export default async function ShelvesPage() {
  const engine = await getDiscoveryEngine();
  const soldIds = await listClosedPrimarySaleIds();
  const shelves = [...engine.state.shelves.values()];

  return (
    <div className="page-wrap">
      <header className="page-lead">
        <h1 className="display page-lead__title">Collector shelves</h1>
        <p className="page-lead__copy">
          Hand-picked sets of works curated by collectors. Follow a shelf to
          discover artists through people whose taste you trust.
        </p>
      </header>
      {shelves.length === 0 ? (
        <EmptyState
          title="No shelves yet"
          body="Save works you love, then group them into a shelf from your Studio. Others can follow it."
          actions={[
            { href: "/studio#shelves", label: "Make a shelf" },
            { href: "/open", label: "Find works to save", variant: "ghost" },
          ]}
        />
      ) : (
        shelves.map((shelf) => {
          const listings = shelf.listingIds
            .map((id) => engine.state.listings.get(id))
            .filter((l): l is NonNullable<typeof l> => !!l);
          const curator = engine.state.creators.get(shelf.curatorId);
          return (
            <section key={shelf.id} style={{ marginBottom: "2.5rem" }}>
              <h2 className="display" style={{ margin: "0 0 0.35rem", fontSize: "1.5rem" }}>
                {shelf.name}
              </h2>
              <p style={{ margin: "0 0 1rem", color: "var(--ink-muted)" }}>
                Curated by {curator?.displayName ?? shelf.curatorId} ·{" "}
                {shelf.followerIds.length}{" "}
                {shelf.followerIds.length === 1 ? "follower" : "followers"}
              </p>
              {listings.length === 0 ? (
                <p style={{ color: "var(--ink-muted)" }}>No works on this shelf yet.</p>
              ) : (
                <PuzzleRail>
                  {listings.map((listing) => (
                    <WorkCard
                      key={listing.id}
                      listing={listing}
                      showActions
                      sold={soldIds.has(listing.id)}
                    />
                  ))}
                </PuzzleRail>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
