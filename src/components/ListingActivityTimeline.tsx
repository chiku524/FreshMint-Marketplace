import { TxExplorerLink } from "@/components/TxExplorerLink";
import type { Chain } from "@/lib/discovery/types";
import type { ListingActivityEvent } from "@/lib/marketplace/activity";
import Link from "next/link";

function formatWhen(at: number): string {
  if (!at) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(at));
  } catch {
    return new Date(at).toISOString();
  }
}

const KIND_CLASS: Record<string, string> = {
  mint: "is-mint",
  list: "is-list",
  offer: "is-offer",
  bid: "is-bid",
  sale: "is-sale",
  transfer: "is-transfer",
  cancel: "is-cancel",
};

export function ListingActivityTimeline({
  events,
  emptyLabel = "No marketplace activity yet.",
  showListingLinks = false,
}: {
  events: Array<
    ListingActivityEvent & { listingId?: string; listingTitle?: string }
  >;
  emptyLabel?: string;
  showListingLinks?: boolean;
}) {
  if (!events.length) {
    return (
      <section className="nft-activity" aria-label="Activity">
        <h2 className="display nft-activity__title">Activity</h2>
        <p className="nft-activity__empty">{emptyLabel}</p>
      </section>
    );
  }

  return (
    <section className="nft-activity" aria-label="Activity">
      <h2 className="display nft-activity__title">Activity</h2>
      <ol className="nft-activity__list">
        {events.map((ev) => (
          <li
            key={ev.id}
            className={`nft-activity__row ${KIND_CLASS[ev.kind] ?? ""}`}
          >
            <span className="nft-activity__kind" data-kind={ev.kind}>
              {ev.label}
            </span>
            <div className="nft-activity__body">
              <p className="nft-activity__headline">
                {ev.actorId ? (
                  <>
                    <Link href={`/creators/${ev.actorId}`}>
                      {ev.actorName ?? "Collector"}
                    </Link>
                    {ev.detail ? (
                      <span className="nft-activity__detail"> · {ev.detail}</span>
                    ) : null}
                  </>
                ) : ev.detail ? (
                  <span className="nft-activity__detail">{ev.detail}</span>
                ) : (
                  <span className="nft-activity__detail">{ev.label}</span>
                )}
              </p>
              {showListingLinks && ev.listingId ? (
                <p className="nft-activity__piece">
                  <Link href={`/listings/${ev.listingId}`}>
                    {ev.listingTitle ?? "View work"}
                  </Link>
                </p>
              ) : null}
              <p className="nft-activity__meta">
                <time dateTime={new Date(ev.at).toISOString()}>
                  {formatWhen(ev.at)}
                </time>
                {ev.txHash ? (
                  <>
                    {" · "}
                    <TxExplorerLink
                      hash={ev.txHash}
                      chain={
                        ev.chain === "evm" ||
                        ev.chain === "solana" ||
                        ev.chain === "boing"
                          ? (ev.chain as Chain)
                          : null
                      }
                      network={ev.network}
                      label="Tx"
                    />
                  </>
                ) : null}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
