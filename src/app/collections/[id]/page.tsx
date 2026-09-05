import { PuzzleRail } from "@/components/PuzzleRail";
import { WorkCard } from "@/components/WorkCard";
import { formatBytes, COLLECTION_MEDIA_CAP_BYTES } from "@/lib/marketplace/drops";
import { listClosedPrimarySaleIds } from "@/lib/marketplace/sales";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const engine = await getDiscoveryEngine();
  const surface = engine.getCollectionSurface(id);
  if (!surface) notFound();

  const { collection, listings, hasTraction } = surface;
  const creator = engine.state.creators.get(collection.creatorId);
  const soldIds = await listClosedPrimarySaleIds();
  const pieces = [...engine.state.listings.values()]
    .filter((l) => l.collectionId === id && !l.delisted)
    .sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="page-wrap">
      <p style={{ margin: "0 0 1rem", color: "var(--ink-muted)", fontSize: "0.9rem" }}>
        <Link href="/collections">Collections</Link>
        {" · "}
        <Link href={`/creators/${collection.creatorId}`}>
          {creator?.displayName ?? "Creator"}
        </Link>
      </p>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        <span className="badge">{collection.chain}</span>
        <span className="badge">{collection.totalItems} items</span>
        {collection.dropKind && collection.dropKind !== "none" ? (
          <span className="badge emerging">
            {collection.dropKind === "open" ? "Open edition drop" : "Limited drop"}
          </span>
        ) : null}
        {hasTraction ? <span className="badge emerging">Traction</span> : null}
      </div>
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        {collection.title}
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "52ch", marginBottom: "1.75rem" }}>
        by{" "}
        <Link href={`/creators/${collection.creatorId}`}>
          {creator?.displayName ?? collection.creatorId}
        </Link>
        . Collect on FreshMint — buy from the artist, then withdraw later if
        you want it on-chain.
        {collection.dropStartsAt && collection.dropEndsAt ? (
          <>
            {" "}
            Drop {new Date(collection.dropStartsAt).toLocaleString()} –{" "}
            {new Date(collection.dropEndsAt).toLocaleString()}
            {collection.dropPriceUsd != null
              ? ` · $${collection.dropPriceUsd}`
              : ""}
            .
          </>
        ) : null}
        {collection.mediaBytes ? (
          <>
            {" "}
            Art {formatBytes(collection.mediaBytes)} of{" "}
            {formatBytes(COLLECTION_MEDIA_CAP_BYTES)}.
          </>
        ) : null}
      </p>

      {listings.length ? (
        <>
          <h2 className="display" style={{ fontSize: "1.35rem", margin: "0 0 0.75rem" }}>
            Surface
          </h2>
          <PuzzleRail style={{ marginBottom: "2rem" }}>
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
        </>
      ) : null}

      <h2 className="display" style={{ fontSize: "1.35rem", margin: "0 0 0.75rem" }}>
        All pieces
      </h2>
      {pieces.length ? (
        <PuzzleRail>
          {pieces.map((listing) => (
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
        <p style={{ color: "var(--ink-muted)" }}>
          No pieces yet.{" "}
          <Link href="/create">Add a drop to this collection</Link>.
        </p>
      )}
    </div>
  );
}
