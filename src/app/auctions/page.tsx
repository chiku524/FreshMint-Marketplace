import { PuzzleRail } from "@/components/PuzzleRail";
import { SoldAuctionCard } from "@/components/SoldAuctionCard";
import { WorkCard } from "@/components/WorkCard";
import { selectLiveAuctionStrip } from "@/lib/discovery";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import { listSoldAuctions } from "@/lib/marketplace/sold-auctions";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Timed drops — FreshMint Marketplace",
  description:
    "Timed drop windows with fixed USD-quoted crypto checkout, plus cleared past sales.",
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

export default async function AuctionsPage() {
  const engine = await getDiscoveryEngine();
  const live = selectLiveAuctionStrip([...engine.state.listings.values()]);
  const sold = await listSoldAuctions(36);
  const empty = live.length === 0 && sold.length === 0;

  return (
    <div className="page-wrap">
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Timed drops
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "54ch", marginBottom: "2rem" }}>
        Scheduled auction windows with a fixed USD-quoted price paid in crypto —
        not an open English bidding board. Live endings can surface on the
        homepage strip; cleared sales land here as proof of discovery converting
        into primary sales.
      </p>

      {empty ? (
        <section
          style={{
            marginBottom: "2.5rem",
            border: "1px solid var(--line)",
            padding: "1.1rem 1.15rem",
            background: "var(--panel)",
            maxWidth: "40rem",
          }}
        >
          <h2 className="display" style={{ margin: "0 0 0.45rem", fontSize: "1.25rem" }}>
            No timed drops live or cleared yet
          </h2>
          <p style={{ margin: 0, color: "var(--ink-muted)", lineHeight: 1.55 }}>
            This lane stays empty until a creator schedules a timed window and
            collectors finish a primary sale. We do not invent live windows.
            Start from Create with the timed-drop intent, or browse discovery /
            calendar while you wait for the first window.
          </p>
          <DiscoverLinks />
        </section>
      ) : null}

      <section style={{ marginBottom: "3rem" }}>
        <h2 className="display" style={{ margin: "0 0 1rem", fontSize: "1.45rem" }}>
          Live now ({live.length})
        </h2>
        {live.length === 0 ? (
          <>
            <p style={{ color: "var(--ink-muted)", margin: 0, maxWidth: "48ch" }}>
              No auction windows are open right now. When one is live, you buy at
              the listed USD quote in crypto before the end time — there is no
              separate bid CTA.
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
          Cleared timed drops ({sold.length})
        </h2>
        <p style={{ color: "var(--ink-muted)", margin: "0 0 1.25rem", maxWidth: "48ch" }}>
          Past artwork that sold successfully during an auction window —
          Emerging and established alike.
        </p>
        {sold.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            No cleared timed drops yet. When a collector completes checkout during a
            window, it appears here.
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
              />
            ))}
          </PuzzleRail>
        )}
      </section>
    </div>
  );
}
