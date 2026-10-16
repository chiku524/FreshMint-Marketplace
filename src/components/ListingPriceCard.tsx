import type { PurchaseSummary } from "@/lib/marketplace/purchase-summary";

/**
 * The listing page's "what does it cost / how do I buy it" card. Sits right
 * under the title so price, sale mode, timing and availability are the first
 * things a buyer sees; the buy/bid controls follow directly below it.
 */
export function ListingPriceCard({ summary }: { summary: PurchaseSummary }) {
  return (
    <section
      className={`listing-price-card listing-price-card--${summary.status}`}
      aria-label="Price and availability"
    >
      <div className="listing-price-card__top">
        <div>
          <p className="listing-price-card__label">{summary.priceLabel}</p>
          <p className="listing-price-card__amount">{summary.amount}</p>
        </div>
        <div className="listing-price-card__side">
          {summary.timing ? (
            <p className="listing-price-card__timing">{summary.timing}</p>
          ) : null}
          {summary.supply ? (
            <p className="listing-price-card__supply">{summary.supply}</p>
          ) : null}
        </div>
      </div>
      <p className="listing-price-card__status">
        <span className="listing-price-card__dot" aria-hidden="true" />
        {summary.statusText}
      </p>
      {summary.howToBuy ? (
        <p className="listing-price-card__how">{summary.howToBuy}</p>
      ) : null}
    </section>
  );
}