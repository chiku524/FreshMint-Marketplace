import { FollowButton } from "@/components/FollowButton";
import { getSessionUser } from "@/lib/auth/session";
import { isEmergingCreator } from "@/lib/discovery";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CreatorsIndexPage() {
  const engine = await getDiscoveryEngine();
  const user = await getSessionUser();
  const now = Date.now();

  const creators = [...engine.state.creators.values()]
    .map((creator) => {
      const emerging = isEmergingCreator(creator, now);
      const publicWorks = [...engine.state.listings.values()].filter(
        (l) =>
          l.creatorId === creator.id && !l.delisted && l.stage !== "draft",
      ).length;
      const risingWorks = [...engine.state.listings.values()].filter(
        (l) =>
          l.creatorId === creator.id &&
          !l.delisted &&
          (l.stage === "rising_eligible" ||
            l.stage === "featured_eligible" ||
            l.stage === "featured"),
      ).length;
      return { creator, emerging, publicWorks, risingWorks };
    })
    .filter((row) => row.publicWorks > 0)
    .sort((a, b) => {
      // Emerging first, then Rising activity, then volume.
      if (a.emerging.emerging !== b.emerging.emerging) {
        return a.emerging.emerging ? -1 : 1;
      }
      if (b.risingWorks !== a.risingWorks) return b.risingWorks - a.risingWorks;
      return (
        b.creator.lifetimePrimaryVolumeUsd - a.creator.lifetimePrimaryVolumeUsd
      );
    });

  const emerging = creators.filter((c) => c.emerging.emerging);
  const risingOriented = creators.filter(
    (c) => !c.emerging.emerging && c.risingWorks > 0,
  );
  const rest = creators.filter(
    (c) => !c.emerging.emerging && c.risingWorks === 0,
  );

  function CreatorRow({
    creator,
    emerging: em,
    publicWorks,
    risingWorks,
  }: (typeof creators)[number]) {
    const following =
      user != null &&
      (engine.state.follows.get(user.id)?.followedArtistIds.includes(creator.id) ??
        false);
    return (
      <li
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.85rem 0",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 14rem" }}>
          <div
            style={{
              display: "flex",
              gap: "0.35rem",
              flexWrap: "wrap",
              marginBottom: "0.25rem",
            }}
          >
            {em.emerging ? <span className="badge emerging">Emerging</span> : null}
            {risingWorks > 0 ? (
              <span className="badge">Rising · {risingWorks}</span>
            ) : null}
            {creator.establishedBadge ? (
              <span className="badge featured">Established</span>
            ) : null}
            {creator.verifiedCreator ? (
              <span className="badge">Verified</span>
            ) : null}
          </div>
          <Link
            href={`/creators/${creator.id}`}
            className="display"
            style={{ fontSize: "1.25rem", color: "inherit" }}
          >
            {creator.displayName}
          </Link>
          <p
            style={{
              margin: "0.2rem 0 0",
              color: "var(--ink-muted)",
              fontSize: "0.85rem",
            }}
          >
            {publicWorks} works · {creator.completedSales} sales · $
            {Math.round(creator.lifetimePrimaryVolumeUsd)} primary
          </p>
        </div>
        <FollowButton artistId={creator.id} initiallyFollowing={following} />
      </li>
    );
  }

  return (
    <div className="page-wrap">
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Creators
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "52ch", marginBottom: "1.75rem" }}>
        Emerging and Rising-oriented directory — follow artists early, before
        Featured inventory fills the room. Individual profiles live at{" "}
        <code style={{ fontSize: "0.85em" }}>/creators/[id]</code>.
      </p>

      <section style={{ marginBottom: "2.5rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.4rem" }}>
          Emerging ({emerging.length})
        </h2>
        {emerging.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            No emerging creators with public works right now. Soft-launch from{" "}
            <Link href="/create">Create</Link>.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {emerging.map((row) => (
              <CreatorRow key={row.creator.id} {...row} />
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginBottom: "2.5rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.4rem" }}>
          Rising-oriented ({risingOriented.length})
        </h2>
        {risingOriented.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            No graduated creators with Rising-eligible works yet. Browse{" "}
            <Link href="/rising">Rising</Link>.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {risingOriented.map((row) => (
              <CreatorRow key={row.creator.id} {...row} />
            ))}
          </ul>
        )}
      </section>

      {rest.length > 0 ? (
        <section>
          <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.4rem" }}>
            More creators ({rest.length})
          </h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {rest.map((row) => (
              <CreatorRow key={row.creator.id} {...row} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
