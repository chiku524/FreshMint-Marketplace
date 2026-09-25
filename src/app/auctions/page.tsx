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
  title: "Auctions — FreshMint Marketplace",
  description:
    "Live timed drops and English auctions, plus cleared past primary sales.",
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
        Most viewed
      </Link>
      <Link href="/calendar" className="badge">
        Calendar
      </Link>
      <Link href="/create?intent=auction" className="badge">
        Schedule a timed drop
      </Link>
    </p>
  );
}

function liveHeading(filter: AuctionsSaleModeFilter, count: number): string {
  if (filter === "english") return `Live English auctions (${count})`;
  if (filter === "timed_window") return `Live timed drops (${count})`;
  return `Live now (${count})`;
}

function archiveHeading(filter: AuctionsSaleModeFilter, count: number): string {
  if (filter === "english") return `Cleared English auctions (${count})`;
  if (filter === "timed_window") return `Cleared timed drops (${count})`;
  return `Cleared sales (${count})`;
}

export default async function AuctionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filter = auctionsSaleModeFromSearchParams(sp);
  const engine = await getDiscoveryEngine();
  const now = Date.now();

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
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Auctions
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "54ch", marginBottom: "1rem" }}>
        Timed windows (buy at list price) and English auctions (open bidding).
        Filter is shareable via the URL. Cleared primary sales stay as proof of
        discovery converting.
      </p>

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
            No {filter === "all" ? "auctions" : filterLabel.toLowerCase()} live or
            cleared yet
          </h2>
          <p style={{ margin: 0, color: "var(--ink-muted)", lineHeight: 1.55 }}>
            This lane stays empty until a creator schedules a matching window and
            collectors finish a primary sale. We do not invent live windows.
            Try another tab, or start from Create with the timed-drop / English
            intent.
          </p>
          <DiscoverLinks />
        </section>
      ) : null}

      <section style={{ marginTop: "1.75rem", marginBottom: "3rem" }}>
        <h2 className="display" style={{ margin: "0 0 1rem", fontSize: "1.45rem" }}>
          {liveHeading(filter, live.length)}
        </h2>
        {live.length === 0 ? (
          <>
            <p style={{ color: "var(--ink-muted)", margin: 0, maxWidth: "48ch" }}>
              {filter === "english"
                ? "No English auctions are open right now. Open bidding appears on the listing when a window is live."
                : filter === "timed_window"
                  ? "No timed drop windows are open right now. When live, you buy at the listed USD quote before the end time."
                  : "No auction windows are open right now."}
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
          Past artwork that sold successfully during an auction window —
          Emerging and established alike.
        </p>
        {sold.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            No cleared sales in this filter yet. When a collector completes
            checkout during a matching window, it appears here.
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
    </div>
  );
}
