import { PuzzleRail } from "@/components/PuzzleRail";
import { WorkCard } from "@/components/WorkCard";
import { getDiscoveryEngine } from "@/lib/marketplace/service";

export const dynamic = "force-dynamic";

export default async function ShelvesPage() {
  const engine = await getDiscoveryEngine();
  const shelves = [...engine.state.shelves.values()];

  return (
    <div style={{ padding: "2.5rem clamp(1rem, 4vw, 3rem) 4rem" }}>
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Collector shelves
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "52ch", marginBottom: "1.75rem" }}>
        Collectors amplify emerging work through named curations that others can
        follow — discovery without waiting on a central editorial team.
      </p>
      {shelves.map((shelf) => {
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
              {shelf.followerIds.length} followers
            </p>
            <PuzzleRail>
              {listings.map((listing) => (
                <WorkCard key={listing.id} listing={listing} showActions />
              ))}
            </PuzzleRail>
          </section>
        );
      })}
    </div>
  );
}
