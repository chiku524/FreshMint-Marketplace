import { RankedWorkCard, WorkCard } from "@/components/WorkCard";
import { DISCOVERY_CONFIG } from "@/lib/discovery";
import { getDiscoveryEngine } from "@/lib/marketplace/service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const engine = await getDiscoveryEngine();
  const home = engine.buildHomepage("collector-mira", 12);
  const mix = DISCOVERY_CONFIG.feedMix;

  return (
    <div>
      <section
        style={{
          minHeight: "72vh",
          display: "grid",
          alignContent: "end",
          padding: "clamp(2rem, 6vw, 5rem) clamp(1rem, 4vw, 3rem) 3rem",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          className="hero-orb"
          aria-hidden
          style={{
            position: "absolute",
            inset: "8% 5% auto auto",
            width: "min(48vw, 420px)",
            aspectRatio: "1",
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 35% 35%, rgba(230,162,60,0.45), transparent 55%), radial-gradient(circle at 70% 60%, rgba(125,206,160,0.35), transparent 50%)",
            filter: "blur(2px)",
            zIndex: 0,
          }}
        />
        <div style={{ position: "relative", zIndex: 1, maxWidth: "40rem" }}>
          <p
            className="display anim-rise"
            style={{
              margin: "0 0 0.75rem",
              fontSize: "clamp(2.8rem, 8vw, 5.2rem)",
              fontWeight: 800,
              lineHeight: 0.95,
            }}
          >
            FreshMint
          </p>
          <h1
            className="anim-rise-delay"
            style={{
              margin: "0 0 1rem",
              fontSize: "clamp(1.35rem, 3vw, 1.85rem)",
              fontWeight: 500,
              lineHeight: 1.25,
              maxWidth: "28ch",
            }}
          >
            Fair discovery for newer artists — without flooding the room.
          </h1>
          <p
            style={{
              margin: 0,
              color: "var(--ink-muted)",
              maxWidth: "42ch",
              fontSize: "1.05rem",
            }}
          >
            {Math.round(mix.emerging_rising * 100)}% Emerging Rising ·{" "}
            {Math.round(mix.following * 100)}% Following ·{" "}
            {Math.round(mix.featured * 100)}% Featured ·{" "}
            {Math.round(mix.auctions_live * 100)}% Live auctions.
          </p>
        </div>
      </section>

      <section style={{ padding: "0 clamp(1rem, 4vw, 3rem) 3rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "1rem",
            marginBottom: "1.25rem",
            flexWrap: "wrap",
          }}
        >
          <h2 className="display" style={{ margin: 0, fontSize: "1.6rem" }}>
            Composed for you
          </h2>
          <span style={{ color: "var(--ink-muted)", fontSize: "0.9rem" }}>
            Rising slots/day: {home.budgets.risingTotal} · Emerging reserved:{" "}
            {home.budgets.risingEmergingReserved}
          </span>
        </div>
        <div className="lane-rail">
          {home.feed.map((item) => (
            <RankedWorkCard key={item.listing.id} item={item} />
          ))}
        </div>
      </section>

      {home.liveAuctions.length > 0 ? (
        <section style={{ padding: "0 clamp(1rem, 4vw, 3rem) 4rem" }}>
          <h2 className="display" style={{ margin: "0 0 1.25rem", fontSize: "1.6rem" }}>
            Live auction strip
          </h2>
          <div className="lane-rail">
            {home.liveAuctions.map((listing) => (
              <WorkCard key={listing.id} listing={listing} bucket="live" showActions />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
