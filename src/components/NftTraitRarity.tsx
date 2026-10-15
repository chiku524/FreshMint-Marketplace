import {
  formatTraitPercent,
  RARITY_METHOD_BLURB,
  type ListingRarity,
} from "@/lib/marketplace/rarity";

/** Trait grid + rank for NFT detail when the collection has trait rarity. */
export function NftTraitRarity({ rarity }: { rarity: ListingRarity }) {
  if (!rarity.traits.length) return null;

  return (
    <div className="nft-rarity">
      {rarity.rank != null ? (
        <p className="nft-rarity__rank">
          <span className="nft-rarity__rank-label">Rarity</span>
          <span className="nft-rarity__rank-value">
            #{rarity.rank}
            <span className="nft-rarity__rank-of">
              {" "}
              / {rarity.scoredSize}
            </span>
          </span>
          <span className="nft-rarity__score" title="Statistical rarity score">
            Score {rarity.score.toFixed(1)}
          </span>
        </p>
      ) : null}
      <dl className="nft-traits nft-traits--rarity">
        {rarity.traits.map((trait) => (
          <div key={`${trait.trait_type}-${trait.value}`}>
            <dt>{trait.trait_type}</dt>
            <dd>
              <span className="nft-traits__value">{trait.value}</span>
              <span className="nft-traits__freq">
                {formatTraitPercent(trait.frequency)} have this
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="nft-rarity__note">{RARITY_METHOD_BLURB}</p>
    </div>
  );
}
