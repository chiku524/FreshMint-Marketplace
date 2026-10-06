import { DiscoverySessionRecorder } from "@/components/DiscoverySessionRecorder";
import { EnglishAuctionHomeCard } from "@/components/EnglishAuctionHomeCard";
import { FeaturedOfTheWeek } from "@/components/FeaturedOfTheWeek";
import { HomeCollectionCard } from "@/components/HomeCollectionCard";
import { HomeCreatorCard } from "@/components/HomeCreatorCard";
import { HomeScrollRail } from "@/components/HomeScrollRail";
import { HomeSectionHeader } from "@/components/HomeSectionHeader";
import { BrandMark } from "@/components/MintLeaf";
import { PuzzleRail } from "@/components/PuzzleRail";
import { TasteSeed } from "@/components/TasteSeed";
import { RankedWorkCard, WorkCard } from "@/components/WorkCard";
import { TreasuryFridayNote } from "@/components/TreasuryFridayNote";
import { getSessionUser } from "@/lib/auth/session";
import { readViewerSession, readViewerTaste } from "@/lib/discovery/cookies";
import { hasTaste, inferTasteFromCatalog } from "@/lib/discovery/taste";
import { getCachedCreatorsHomeSection } from "@/lib/marketplace/creators-browse";
import { getCachedHomeDiscovery } from "@/lib/marketplace/home-discovery";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import Link from "next/link";

export const dynamic = "force-dynamic";

function collectionsSubtitle(
  mode: "trending" | "top_volume" | "new" | "mixed",
): string {
  switch (mode) {
    case "trending":
      return "Collections with the strongest sales this week.";
    case "top_volume":
      return "Top collections by all-time volume.";
    case "new":
      return "Fresh collections from this week.";
    case "mixed":
      return "Volume leaders mixed with new collections.";
  }
}

function creatorsSubtitle(
  mode: "trending" | "most_active" | "newest" | "mixed",
): string {
  switch (mode) {
    case "trending":
      return "Creators with the strongest sales this week.";
    case "most_active":
      return "Creators publishing the most right now.";
    case "newest":
      return "New voices just entering the market.";
    case "mixed":
      return "Rising volume, activity, and new creators.";
  }
}

function hotSubtitle(
  mode: "hot" | "most_viewed" | "newest" | "mixed",
): string {
  switch (mode) {
    case "hot":
      return "Works gaining attention right now.";
    case "most_viewed":
      return "The most-viewed public works.";
    case "newest":
      return "Just published.";
    case "mixed":
      return "Hot works, topped up with most-viewed and newest.";
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
  const [discovery, creatorsHome] = await Promise.all([
    getCachedHomeDiscovery(),
    getCachedCreatorsHomeSection(),
  ]);
  const personalized = Boolean(user);

  return (
    <div className="fm-home">
      <section className="fm-home-hero">
        <div className="fm-home-hero__copy">
          <div className="fm-home-hero__brand anim-rise">
            <BrandMark size={56} />
          </div>
          <h1 className="fm-home-hero__title anim-rise-delay">
            Discover new art before it floods the feed.
          </h1>
          <p className="fm-home-hero__lede anim-rise-delay">
            Fair discovery for digital art. Emerging artists get a real quota.
          </p>
          <TreasuryFridayNote
            surface="home"
            className="fm-home-hero__note anim-rise-delay"
          />
          <div className="fm-home-hero__actions anim-rise-delay">
            <Link href="/open" className="fm-btn fm-btn--primary">
              Browse works
            </Link>
            <Link href="/create" className="fm-btn fm-btn--ghost">
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

      {creatorsHome.items.length > 0 ? (
        <section className="site-section">
          <HomeSectionHeader
            title={
              creatorsHome.subtitleMode === "trending"
                ? "Trending creators"
                : creatorsHome.subtitleMode === "most_active"
                  ? "Most active creators"
                  : creatorsHome.subtitleMode === "newest"
                    ? "Newest creators"
                    : "Creators to follow"
            }
            subtitle={creatorsSubtitle(creatorsHome.subtitleMode)}
            viewAllHref={creatorsHome.viewAllHref}
          />
          <HomeScrollRail>
            {creatorsHome.items.map((item) => (
              <HomeCreatorCard key={item.id} item={item} />
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
            title="Auctions ending soon"
            subtitle="Open bidding, soonest ending first."
            viewAllHref="/auctions?saleMode=english"
            viewAllLabel="All English auctions"
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

      <section className="site-section">
        <HomeSectionHeader
          title={
            personalized
              ? `For ${user!.displayName}`
              : "Composed for you"
          }
          subtitle={
            personalized
              ? "A fair mix of Emerging, Following, and Featured."
              : "Pick tastes below to tune Emerging — then explore your feed."
          }
          viewAllHref="/open"
          viewAllLabel="Browse all"
        />
        {!personalized ? <TasteSeed selected={taste.styleTags} /> : null}
        <DiscoverySessionRecorder
          listingIds={home.feed.map((item) => item.listing.id)}
          artistIds={home.feed.map((item) => item.listing.creatorId)}
          collectionIds={home.feed
            .map((item) => item.listing.collectionId)
            .filter((id): id is string => !!id)}
        />
        {home.feed.length === 0 ? (
          <p className="fm-empty-copy">
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
