import { CreatorAvatar } from "@/components/CreatorAvatar";
import { PuzzleRail } from "@/components/PuzzleRail";
import { WorkCard } from "@/components/WorkCard";
import { searchCatalog } from "@/lib/marketplace/search";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Search — FreshMint Marketplace",
  description: "Find works, collections, and creators.",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qRaw = typeof sp.q === "string" ? sp.q : "";
  const engine = await getDiscoveryEngine();
  const hits = searchCatalog({
    query: qRaw,
    listings: engine.state.listings.values(),
    collections: engine.state.collections.values(),
    creators: engine.state.creators.values(),
  });

  const works = hits.filter((h) => h.kind === "work");
  const collections = hits.filter((h) => h.kind === "collection");
  const creators = hits.filter((h) => h.kind === "creator");

  return (
    <div className="page-wrap">
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Search
      </h1>
      <form action="/search" method="get" style={{ marginBottom: "1.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input
          name="q"
          defaultValue={qRaw}
          placeholder="Works, collections, creators…"
          maxLength={80}
          style={{
            flex: "1 1 16rem",
            background: "var(--panel)",
            border: "1px solid var(--line)",
            color: "var(--ink)",
            padding: "0.55rem 0.75rem",
          }}
        />
        <button type="submit" className="badge featured" style={{ cursor: "pointer", background: "transparent" }}>
          Search
        </button>
      </form>

      {!qRaw.trim() ? (
        <p style={{ color: "var(--ink-muted)" }}>
          Type a title or name. Results are shareable via <code>?q=</code>.
        </p>
      ) : hits.length === 0 ? (
        <p style={{ color: "var(--ink-muted)" }}>
          No matches for “{qRaw}”. Try Open Lane or Creators.
        </p>
      ) : (
        <>
          {works.length > 0 ? (
            <section style={{ marginBottom: "2rem" }}>
              <h2 className="display" style={{ fontSize: "1.35rem", margin: "0 0 0.75rem" }}>
                Works ({works.length})
              </h2>
              <PuzzleRail>
                {works.map((h) =>
                  h.kind === "work" ? (
                    <WorkCard
                      key={h.listing.id}
                      listing={h.listing}
                      bucket="open"
                      showActions
                      creatorName={
                        engine.state.creators.get(h.listing.creatorId)?.displayName
                      }
                      creatorAvatarUrl={
                        engine.state.creators.get(h.listing.creatorId)?.avatarUrl
                      }
                    />
                  ) : null,
                )}
              </PuzzleRail>
            </section>
          ) : null}
          {collections.length > 0 ? (
            <section style={{ marginBottom: "2rem" }}>
              <h2 className="display" style={{ fontSize: "1.35rem", margin: "0 0 0.75rem" }}>
                Collections ({collections.length})
              </h2>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.45rem" }}>
                {collections.map((h) =>
                  h.kind === "collection" ? (
                    <li key={h.collection.id}>
                      <Link href={`/collections/${h.collection.id}`} className="badge">
                        {h.collection.title}
                      </Link>
                    </li>
                  ) : null,
                )}
              </ul>
            </section>
          ) : null}
          {creators.length > 0 ? (
            <section>
              <h2 className="display" style={{ fontSize: "1.35rem", margin: "0 0 0.75rem" }}>
                Creators ({creators.length})
              </h2>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {creators.map((h) =>
                  h.kind === "creator" ? (
                    <li
                      key={h.creator.id}
                      style={{
                        display: "flex",
                        gap: "0.75rem",
                        alignItems: "center",
                        padding: "0.55rem 0",
                        borderBottom: "1px solid var(--line)",
                      }}
                    >
                      <CreatorAvatar
                        id={h.creator.id}
                        displayName={h.creator.displayName}
                        avatarUrl={h.creator.avatarUrl}
                        size={40}
                      />
                      <Link href={`/creators/${h.creator.id}`} className="display" style={{ fontSize: "1.1rem", color: "inherit" }}>
                        {h.creator.displayName}
                      </Link>
                    </li>
                  ) : null,
                )}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
