import { TxExplorerLink } from "@/components/TxExplorerLink";
import type { TreasuryActivityItem } from "@/lib/marketplace/treasury-public";
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
  friday_buy: "is-sale",
  raffle: "is-mint",
  fee: "is-list",
  featured_boost: "is-offer",
};

export function TreasuryActivityList({
  items,
}: {
  items: TreasuryActivityItem[];
}) {
  if (!items.length) {
    return (
      <section className="nft-activity treasury-activity" aria-label="Activity">
        <h2 className="display nft-activity__title">Activity</h2>
        <p className="nft-activity__empty">
          No treasury movements recorded yet. Sale fees, Featured boosts, and
          Friday buys appear here when they settle.
        </p>
      </section>
    );
  }

  return (
    <section className="nft-activity treasury-activity" aria-label="Activity">
      <h2 className="display nft-activity__title">Activity</h2>
      <ol className="nft-activity__list">
        {items.map((ev) => (
          <li
            key={ev.id}
            className={`nft-activity__row ${KIND_CLASS[ev.kind] ?? ""}`}
          >
            <span className="nft-activity__kind" data-kind={ev.kind}>
              {ev.label}
            </span>
            <div className="nft-activity__body">
              <p className="nft-activity__headline">
                <span className="nft-activity__detail">{ev.detail}</span>
              </p>
              {ev.href ? (
                <p className="nft-activity__piece">
                  <Link href={ev.href}>View work</Link>
                </p>
              ) : null}
              <p className="nft-activity__meta">
                {formatWhen(ev.at)}
                {ev.txHash ? (
                  <>
                    {" · "}
                    <TxExplorerLink hash={ev.txHash} network={ev.network} />
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
