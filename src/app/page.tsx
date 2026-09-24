import { DiscoverySessionRecorder } from "@/components/DiscoverySessionRecorder";
import { EnglishAuctionHomeCard } from "@/components/EnglishAuctionHomeCard";
import { FeaturedOfTheWeek } from "@/components/FeaturedOfTheWeek";
import { HomeCollectionCard } from "@/components/HomeCollectionCard";
import { HomeScrollRail } from "@/components/HomeScrollRail";
import { HomeSectionHeader } from "@/components/HomeSectionHeader";
import { HowItWorksNote } from "@/components/HowItWorksNote";
import { BrandMark } from "@/components/MintLeaf";
import { PuzzleRail } from "@/components/PuzzleRail";
import { TasteSeed } from "@/components/TasteSeed";
import { RankedWorkCard, WorkCard } from "@/components/WorkCard";
import { getSessionUser } from "@/lib/auth/session";
import { readViewerSession, readViewerTaste } from "@/lib/discovery/cookies";
import { hasTaste, inferTasteFromCatalog } from "@/lib/discovery/taste";
import { getCachedHomeDiscovery } from "@/lib/marketplace/home-discovery";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import Link from "next/link";

export const dynamic = "force-dynamic";

function collectionsSubtitle(
  mode: "trending" | "top_volume" | "new" | "mixed",
): string {
  switch (mode) {
    case "trending":
      return "Ranked by completed sale volume over the last 7 days.";
    case "top_volume":
      return "Sparse 7-day sales — showing top all-time volume collections.";
    case "new":
      return "Sparse sales activity — showing collections new this week.";
    case "mixed":
      return "7-day volume leaders, topped up with all-time volume and new collections.";
  }
}

function hotSubtitle(
  mode: "hot" | "most_viewed" | "newest" | "mixed",
): string {
  switch (mode) {
    case "hot":
      return "Scored from views, saves, bids, and purchases in the last 72 hours.";
    case "most_viewed":
      return "Quiet last 72 hours — showing most-viewed public works.";
    case "newest":
      return "Quiet activity — showing newest published works.";
    case "mixed":
      return "72-hour hot works, topped up with most-viewed and newest.";
  }
}

export default async function HomePage() {
  const engine = await getDiscoveryEngine();
  const user = await getSessionUser();
  const viewerId = user?.id ?? null;
  const session = await readViewerSession(viewerId);
  const cookieTaste = await readViewerTaste();
  const follows = viewerId ? engine.state.follows.get(viewerId) ?? null : null;
  const taste = hasTaste(cookieTaste)
    ? cookieTaste
    : inferTasteFromCatalog(follows, engine.state.listings.values());
  const home = engine.buildHomepage(viewerId, 12, Date.now(), {
    session,
    taste,
    recordImpressions: false,
  });
  const discovery = await getCachedHomeDiscovery();
  const personalized = Boolean(user);

  return (
    <div>
      <section className="fm-home-hero">
        <div className="fm-home-hero__copy">
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
            Discover new art before it floods the feed.
          </h1>
          <HowItWorksNote kind="home" />
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <Link
              href="/open"
              className="badge featured"
              style={{ padding: "0.55rem 0.9rem" }}
            >
              Browse works
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
        <div className="fm-home-hero__feature">
          <FeaturedOfTheWeek />
        </div>
      </section>

      {discovery.collections.items.length > 0 ? (
        <section className="site-section">
          <HomeSectionHeader
            title={
              discovery.collections.subtitleMode === "trending"
                ? "Trending collections"
                : discovery.collections.subtitleMode === "top_volume"
                  ? "Top collections"
                  : discovery.collections.subtitleMode === "new"
                    ? "New collections"
                    : "Collections to explore"
            }
            subtitle={collectionsSubtitle(discovery.collections.subtitleMode)}
            viewAllHref={discovery.collections.viewAllHref}
          />
          <HomeScrollRail>
            {discovery.collections.items.map((item) => (
              <HomeCollectionCard key={item.id} item={item} />
            ))}
          </HomeScrollRail>
        </section>
      ) : null}

      {discovery.hotWorks.items.length > 0 ? (
        <section className="site-section">
          <HomeSectionHeader
            title={
              discovery.hotWorks.subtitleMode === "hot"
                ? "Hot works"
                : discovery.hotWorks.subtitleMode === "most_viewed"
                  ? "Most viewed"
                  : discovery.hotWorks.subtitleMode === "newest"
                    ? "Newest works"
                    : "Works to explore"
            }
            subtitle={hotSubtitle(discovery.hotWorks.subtitleMode)}
            viewAllHref={discovery.hotWorks.viewAllHref}
          />
          <PuzzleRail>
            {discovery.hotWorks.items.map((listing) => (
              <WorkCard
                key={listing.id}
                listing={listing}
                bucket="open"
                showActions
                creatorName={
                  engine.state.creators.get(listing.creatorId)?.displayName
                }
              />
            ))}
          </PuzzleRail>
        </section>
      ) : null}

      {discovery.englishEndingSoon.length > 0 ? (
        <section className="site-section">
          <HomeSectionHeader
            title="English auctions ending soon"
            subtitle="Live open bidding — soonest ending first."
            viewAllHref="/auctions"
            viewAllLabel="All auctions"
          />
          <HomeScrollRail>
            {discovery.englishEndingSoon.map((listing) => (
              <EnglishAuctionHomeCard
                key={listing.id}
                listing={listing}
                creatorName={
                  engine.state.creators.get(listing.creatorId)?.displayName
                }
              />
            ))}
          </HomeScrollRail>
        </section>
      ) : null}

      {discovery.timedDropsLive.length > 0 ? (
        <section className="site-section">
          <HomeSectionHeader
            title="Live timed drops"
            subtitle="Buy at list price while the window is open."
            viewAllHref="/auctions"
            viewAllLabel="All timed drops"
          />
          <HomeScrollRail>
            {discovery.timedDropsLive.map((listing) => (
              <div key={listing.id} className="fm-home-work-slot">
                <WorkCard
                  listing={listing}
                  bucket="live"
                  showActions
                  creatorName={
                    engine.state.creators.get(listing.creatorId)?.displayName
                  }
                />
              </div>
            ))}
          </HomeScrollRail>
        </section>
      ) : null}

      {discovery.newCollections.length > 0 ? (
        <section className="site-section">
          <HomeSectionHeader
            title="New collections this week"
            subtitle="Created in the last 7 days with at least one published work."
            viewAllHref="/collections/new"
          />
          <HomeScrollRail>
            {discovery.newCollections.map((item) => (
              <HomeCollectionCard key={item.id} item={item} />
            ))}
          </HomeScrollRail>
        </section>
      ) : null}

      <section className="site-section">
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
            {!personalized ? " · pick tastes below for Emerging" : ""}
          </span>
        </div>
        {!personalized ? <TasteSeed selected={taste.styleTags} /> : null}
        <DiscoverySessionRecorder
          listingIds={home.feed.map((item) => item.listing.id)}
          artistIds={home.feed.map((item) => item.listing.creatorId)}
          collectionIds={home.feed
            .map((item) => item.listing.collectionId)
            .filter((id): id is string => !!id)}
        />
        {home.feed.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            Feed is empty — soft-launch a work or follow an emerging artist.
          </p>
        ) : (
          <PuzzleRail>
            {home.feed.map((item) => (
              <RankedWorkCard
                key={item.listing.id}
                item={item}
                creatorName={
                  engine.state.creators.get(item.listing.creatorId)?.displayName
                }
              />
            ))}
          </PuzzleRail>
        )}
      </section>
    </div>
  );
}
