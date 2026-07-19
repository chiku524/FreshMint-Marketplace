import { SoldAuctionCard } from "@/components/SoldAuctionCard";
import { WorkCard } from "@/components/WorkCard";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import { listSoldAuctions } from "@/lib/marketplace/sold-auctions";
import { selectLiveAuctionStrip } from "@/lib/discovery";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Auctions — FreshMint Marketplace",
  description: "Live auction strip and successfully cleared past auctions.",
};

export default async function AuctionsPage() {
  const engine = await getDiscoveryEngine();
  const live = selectLiveAuctionStrip([...engine.state.listings.values()]);
  const sold = await listSoldAuctions(36);

  return (
    <div style={{ padding: "2.5rem clamp(1rem, 4vw, 3rem) 4rem" }}>
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Auctions
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "48ch", marginBottom: "2rem" }}>
        Live endings share a scarce strip on the homepage. Cleared auctions land
        here as proof of discovery converting into primary sales.
      </p>

      <section style={{ marginBottom: "3rem" }}>
        <h2 className="display" style={{ margin: "0 0 1rem", fontSize: "1.45rem" }}>
          Live now ({live.length})
        </h2>
        {live.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            No auctions in window — check the{" "}
            <Link href="/calendar" style={{ color: "var(--accent-soft)" }}>
              calendar
            </Link>{" "}
            for upcoming starts.
          </p>
        ) : (
          <div className="lane-rail">
            {live.map((listing) => (
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
        )}
      </section>

      <section>
        <h2 className="display" style={{ margin: "0 0 0.5rem", fontSize: "1.45rem" }}>
          Cleared auctions ({sold.length})
        </h2>
        <p style={{ color: "var(--ink-muted)", margin: "0 0 1.25rem", maxWidth: "48ch" }}>
          Past artwork that sold successfully at hammer — Emerging and established
          alike.
        </p>
        {sold.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            No cleared auctions yet. When a collector wins an auction, it appears
            here.
          </p>
        ) : (
          <div className="lane-rail">
            {sold.map((item) => (
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
