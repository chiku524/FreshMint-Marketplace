import { requestNow } from "@/lib/time";
import { AuctionsSaleModeTabs } from "@/components/AuctionsSaleModeTabs";
import { PuzzleRail } from "@/components/PuzzleRail";
import { SoldAuctionCard } from "@/components/SoldAuctionCard";
import { WorkCard } from "@/components/WorkCard";
import {
  auctionsFilterLabel,
  auctionsSaleModeFromSearchParams,
  filterListingsByAuctionsSaleMode,
  isLiveAuctionListing,
  listingMatchesAuctionsFilter,
  type AuctionsSaleModeFilter,
} from "@/lib/marketplace/auctions-filter";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import { listSoldAuctions } from "@/lib/marketplace/sold-auctions";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Auctions",
  description:
    "Live auctions, timed drops, and recently sold works on FreshMint.",
};

function DiscoverLinks() {
  return (
    <p
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.45rem",
        margin: "0.85rem 0 0",
      }}
    >
      <Link href="/open" className="badge emerging">
        Open Lane
      </Link>
      <Link href="/rising" className="badge emerging">
        Rising
      </Link>
      <Link href="/featured" className="badge featured">
        Featured
      </Link>
      <Link href="/trending" className="badge">
        Trending
      </Link>
      <Link href="/calendar" className="badge">
        Calendar
      </Link>
      <Link href="/create?intent=auction" className="badge">
        Start an auction
      </Link>
    </p>
  );
}

function liveHeading(filter: AuctionsSaleModeFilter, count: number): string {
  if (filter === "english") return `Live English auctions (${count})`;
  if (filter === "dutch") return `Live Dutch auctions (${count})`;
  if (filter === "timed_window") return `Live timed listings (${count})`;
  return `Live now (${count})`;
}

function archiveHeading(filter: AuctionsSaleModeFilter, count: number): string {
  if (filter === "english") return `Sold English auctions (${count})`;
  if (filter === "dutch") return `Sold Dutch auctions (${count})`;
  if (filter === "timed_window") return `Sold timed listings (${count})`;
  return `Recently sold (${count})`;
}

export default async function AuctionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filter = auctionsSaleModeFromSearchParams(sp);
  const engine = await getDiscoveryEngine();
  const now = requestNow();

  const liveAll = [...engine.state.listings.values()]
    .filter((l) => isLiveAuctionListing(l, now))
    .sort((a, b) => (a.auctionEndsAt ?? 0) - (b.auctionEndsAt ?? 0));
  const live = filterListingsByAuctionsSaleMode(liveAll, filter);

  const soldAll = await listSoldAuctions(48);
  const sold = soldAll.filter((item) =>
    listingMatchesAuctionsFilter(item.listing, filter),
  );
  const empty = live.length === 0 && sold.length === 0;
  const filterLabel = auctionsFilterLabel(filter);

  return (
    <div className="page-wrap">
      <header className="page-lead">
        <h1 className="display page-lead__title">Auctions</h1>
        <p className="page-lead__copy">
          Bid on live auctions, catch time-limited drops, and see what recently
          sold. Use the tabs to narrow by sale type.
        </p>
      </header>

      <AuctionsSaleModeTabs active={filter} />

      {empty ? (
        <section
          style={{
            margin: "1.5rem 0 2.5rem",
            border: "1px solid var(--line)",
            padding: "1.1rem 1.15rem",
            background: "var(--panel)",
            maxWidth: "40rem",
          }}
        >
          <h2 className="display" style={{ margin: "0 0 0.45rem", fontSize: "1.25rem" }}>
            No {filter === "all" ? "auctions" : filterLabel.toLowerCase()} yet
          </h2>
          <p style={{ margin: 0, color: "var(--ink-muted)", lineHeight: 1.55 }}>
            Nothing is live or recently sold here yet. Try another tab, browse
            everything for sale, or schedule your own auction.
          </p>
          <DiscoverLinks />
        </section>
      ) : null}

      {empty ? null : (
      <>
      <section style={{ marginTop: "1.75rem", marginBottom: "3rem" }}>
        <h2 className="display" style={{ margin: "0 0 1rem", fontSize: "1.45rem" }}>
          {liveHeading(filter, live.length)}
        </h2>
        {live.length === 0 ? (
          <>
            <p style={{ color: "var(--ink-muted)", margin: 0, maxWidth: "48ch" }}>
              {filter === "english"
                ? "No English auctions are open right now. Check back soon or browse other sale types."
                : filter === "timed_window"
                  ? "No timed drops are open right now. When one is live, you can buy at the listed price until it ends."
                  : "Nothing is live right now. Check back soon."}
            </p>
            {!empty ? <DiscoverLinks /> : null}
          </>
        ) : (
          <PuzzleRail>
            {live.map((listing) => (
              <WorkCard
                key={listing.id}
                listing={listing}
                bucket="live"
                showActions
                creatorName={
                  engine.state.creators.get(listing.creatorId)?.displayName
                }
                creatorAvatarUrl={
                  engine.state.creators.get(listing.creatorId)?.avatarUrl
                }
                collection={
                  listing.collectionId
                    ? engine.state.collections.get(listing.collectionId) ?? null
                    : null
                }
              />
            ))}
          </PuzzleRail>
        )}
      </section>

      <section>
        <h2 className="display" style={{ margin: "0 0 0.5rem", fontSize: "1.45rem" }}>
          {archiveHeading(filter, sold.length)}
        </h2>
        <p style={{ color: "var(--ink-muted)", margin: "0 0 1.25rem", maxWidth: "48ch" }}>
          Works that sold during an auction or timed drop.
        </p>
        {sold.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            Nothing has sold under this filter yet.
          </p>
        ) : (
          <PuzzleRail>
            {sold.map((item) => (
              <SoldAuctionCard
                key={`${item.listing.id}-${item.soldAt}`}
                item={item}
                creatorName={
                  engine.state.creators.get(item.listing.creatorId)?.displayName
                }
                creatorAvatarUrl={
                  engine.state.creators.get(item.listing.creatorId)?.avatarUrl
                }
              />
            ))}
          </PuzzleRail>
        )}
      </section>
      </>
      )}
    </div>
  );
}
