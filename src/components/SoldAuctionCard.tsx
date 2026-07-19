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
    <WorkCard
      listing={{ ...item.listing, priceUsd: item.amountUsd }}
      bucket="sold"
      showActions={false}
      creatorName={creatorName}
      trackImpression={false}
      footer={
        <>
          Cleared {formatSoldAt(item.soldAt)} · hammer ${item.amountUsd} · collected
          by <Link href={`/creators/${item.buyerId}`}>{item.buyerName}</Link>
        </>
      }
    />
  );
}
