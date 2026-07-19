import type { SoldAuction } from "@/lib/marketplace/sold-auctions";
import Link from "next/link";
import { WorkCard } from "./WorkCard";

function formatSoldAt(ms: number) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ms));
}

export function SoldAuctionCard({
  item,
  creatorName,
}: {
  item: SoldAuction;
  creatorName?: string;
}) {
  return (
    <div style={{ display: "grid", gap: "0.35rem" }}>
      <WorkCard
        listing={{ ...item.listing, priceUsd: item.amountUsd }}
        bucket="sold"
        showActions={false}
        creatorName={creatorName}
        trackImpression={false}
      />
      <p
        style={{
          margin: 0,
          padding: "0 0.15rem",
          color: "var(--ink-muted)",
          fontSize: "0.85rem",
        }}
      >
        Cleared {formatSoldAt(item.soldAt)} · hammer ${item.amountUsd} · collected by{" "}
        <Link href={`/creators/${item.buyerId}`}>{item.buyerName}</Link>
      </p>
    </div>
  );
}
