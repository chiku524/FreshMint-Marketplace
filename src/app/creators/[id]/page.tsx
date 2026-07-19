import { FollowButton } from "@/components/FollowButton";
import { WorkCard } from "@/components/WorkCard";
import { getSessionUser } from "@/lib/auth/session";
import { isEmergingCreator } from "@/lib/discovery";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CreatorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const engine = await getDiscoveryEngine();
  const creator = engine.state.creators.get(id);
  if (!creator) notFound();

  const emerging = isEmergingCreator(creator);
  const works = [...engine.state.listings.values()]
    .filter((l) => l.creatorId === id && !l.delisted && l.stage !== "draft")
    .sort((a, b) => b.createdAt - a.createdAt);

  const user = await getSessionUser();
  const following =
    user != null &&
    (engine.state.follows.get(user.id)?.followedArtistIds.includes(id) ?? false);

  return (
    <div style={{ padding: "2.5rem clamp(1rem, 4vw, 3rem) 4rem" }}>
      <p style={{ margin: "0 0 1rem", color: "var(--ink-muted)", fontSize: "0.9rem" }}>
        <Link href="/open">Open Lane</Link>
        {" · "}
        <Link href="/rising">Rising</Link>
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: "1rem",
          alignItems: "flex-start",
          marginBottom: "2rem",
        }}
      >
        <div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
            {emerging.emerging ? (
              <span className="badge emerging">Emerging</span>
            ) : null}
            {creator.establishedBadge ? (
              <span className="badge featured">Established</span>
            ) : null}
            {creator.verifiedCreator ? (
              <span className="badge">Verified</span>
            ) : null}
          </div>
          <h1 className="display" style={{ margin: "0 0 0.4rem", fontSize: "2.6rem" }}>
            {creator.displayName}
          </h1>
          <p style={{ color: "var(--ink-muted)", margin: 0, maxWidth: "48ch" }}>
            {creator.completedSales} sales · $
            {Math.round(creator.lifetimePrimaryVolumeUsd)} primary volume ·
            curator score {creator.curatorScore}
          </p>
          <p style={{ color: "var(--ink-muted)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
            Wallets:{" "}
            {creator.wallets
              .map((w) => `${w.chain}:${w.address.slice(0, 8)}…`)
              .join(" · ")}
          </p>
        </div>
        <FollowButton artistId={id} initiallyFollowing={following} />
      </div>

      <h2 className="display" style={{ margin: "0 0 1rem", fontSize: "1.4rem" }}>
        Works ({works.length})
      </h2>
      {works.length === 0 ? (
        <p style={{ color: "var(--ink-muted)" }}>No public listings yet.</p>
      ) : (
        <div className="lane-rail">
          {works.map((listing) => (
            <WorkCard
              key={listing.id}
              listing={listing}
              emerging={emerging.emerging}
              creatorName={creator.displayName}
              showActions
            />
          ))}
        </div>
      )}
    </div>
  );
}
