import { BrandMark, MintLeaf } from "@/components/MintLeaf";
import { SoldAuctionCard } from "@/components/SoldAuctionCard";
import { RankedWorkCard, WorkCard } from "@/components/WorkCard";
import { getSessionUser } from "@/lib/auth/session";
import { DISCOVERY_CONFIG } from "@/lib/discovery";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import { listSoldAuctions } from "@/lib/marketplace/sold-auctions";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const engine = await getDiscoveryEngine();
  const user = await getSessionUser();
  const viewerId = user?.id ?? "collector-mira";
  const home = engine.buildHomepage(viewerId, 12);
  const soldAuctions = await listSoldAuctions(6);
  const mix = DISCOVERY_CONFIG.feedMix;
  const personalized = Boolean(user);

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
            inset: "4% 2% auto auto",
            width: "min(52vw, 440px)",
            aspectRatio: "1",
            display: "grid",
            placeItems: "center",
            zIndex: 0,
            opacity: 0.55,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: "12%",
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 40% 35%, rgba(77,184,132,0.28), transparent 55%), radial-gradient(circle at 70% 65%, rgba(201,149,58,0.12), transparent 50%)",
              filter: "blur(8px)",
            }}
          />
          <MintLeaf size={220} gradientId="hero-leaf" />
        </div>
        <div style={{ position: "relative", zIndex: 1, maxWidth: "40rem" }}>
          <div
            className="anim-rise"
            style={{
              margin: "0 0 0.85rem",
              fontSize: "clamp(2.6rem, 7.5vw, 4.8rem)",
            }}
          >
            <BrandMark size={56} />
          </div>
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
              margin: "0 0 1.25rem",
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
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <Link
              href="/open"
              className="badge featured"
              style={{ padding: "0.55rem 0.9rem" }}
            >
              Browse Open Lane
            </Link>
            <Link
              href="/create"
              className="badge emerging"
              style={{ padding: "0.55rem 0.9rem" }}
            >
              Soft-launch a work
            </Link>
          </div>
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
            {personalized
              ? `Composed for ${user!.displayName}`
              : "Composed for you"}
          </h2>
          <span style={{ color: "var(--ink-muted)", fontSize: "0.9rem" }}>
            Rising slots/day: {home.budgets.risingTotal} · Emerging reserved:{" "}
            {home.budgets.risingEmergingReserved}
            {!personalized ? " · demo as Mira for Following mix" : ""}
          </span>
        </div>
        {home.feed.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            Feed is empty — soft-launch a work or follow an emerging artist.
          </p>
        ) : (
          <div className="lane-rail">
            {home.feed.map((item) => (
              <RankedWorkCard
                key={item.listing.id}
                item={item}
                creatorName={
                  engine.state.creators.get(item.listing.creatorId)?.displayName
                }
              />
            ))}
          </div>
        )}
      </section>

      {home.liveAuctions.length > 0 ? (
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
              Live auction strip
            </h2>
            <Link href="/auctions" style={{ color: "var(--ink-muted)", fontSize: "0.9rem" }}>
              All auctions →
            </Link>
          </div>
          <div className="lane-rail">
            {home.liveAuctions.map((listing) => (
              <WorkCard
                key={listing.id}
                listing={listing}
                bucket="live"
                showActions
                creatorName={
                  engine.state.creators.get(listing.creatorId)?.displayName
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      <section style={{ padding: "0 clamp(1rem, 4vw, 3rem) 4rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "1rem",
            marginBottom: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          <h2 className="display" style={{ margin: 0, fontSize: "1.6rem" }}>
            Cleared auctions
          </h2>
          <Link href="/auctions" style={{ color: "var(--ink-muted)", fontSize: "0.9rem" }}>
            View archive →
          </Link>
        </div>
        <p style={{ color: "var(--ink-muted)", margin: "0 0 1.25rem", maxWidth: "46ch" }}>
          Past artwork that sold successfully — discovery that converted.
        </p>
        {soldAuctions.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            No cleared auctions yet. Wins will appear here after hammer.
          </p>
        ) : (
          <div className="lane-rail">
            {soldAuctions.map((item) => (
              <SoldAuctionCard
                key={`${item.listing.id}-${item.soldAt}`}
                item={item}
                creatorName={
                  engine.state.creators.get(item.listing.creatorId)?.displayName
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
