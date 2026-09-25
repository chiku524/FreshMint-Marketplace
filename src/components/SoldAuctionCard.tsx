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
  creatorAvatarUrl,
}: {
  item: SoldAuction;
  creatorName?: string;
  creatorAvatarUrl?: string | null;
}) {
  return (
    <WorkCard
      listing={{ ...item.listing, priceUsd: item.amountUsd }}
      bucket="sold"
      showActions={false}
      creatorName={creatorName}
      creatorAvatarUrl={creatorAvatarUrl}
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
