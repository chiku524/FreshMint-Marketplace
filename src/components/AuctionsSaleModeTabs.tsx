import {
  auctionsHref,
  auctionsFilterLabel,
  type AuctionsSaleModeFilter,
} from "@/lib/marketplace/auctions-filter";
import Link from "next/link";

const TABS: AuctionsSaleModeFilter[] = ["all", "timed_window", "english"];

export function AuctionsSaleModeTabs({
  active,
}: {
  active: AuctionsSaleModeFilter;
}) {
  return (
    <div
      className="fm-filter-tabs"
      role="tablist"
      aria-label="Auction sale mode"
    >
      {TABS.map((tab) => {
        const selected = tab === active;
        return (
          <Link
            key={tab}
            href={auctionsHref(tab)}
            role="tab"
            aria-selected={selected}
            className={`fm-filter-tab${selected ? " is-active" : ""}`}
            scroll={false}
          >
            {auctionsFilterLabel(tab)}
          </Link>
        );
      })}
    </div>
  );
}
