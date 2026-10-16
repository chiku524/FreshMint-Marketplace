import { WorkCard } from "@/components/WorkCard";
import type { Collection, Listing } from "@/lib/discovery/types";
import {
  RARITY_METHOD_BLURB,
  type ListingRarity,
} from "@/lib/marketplace/rarity";
import type { CollectionSort } from "@/lib/marketplace/rarity-order";
import Link from "next/link";

/**
 * Gallery for one page of a collection. Ordering (newest / rarity) is done on
 * the server across every item, so "Rarity" on page 1 shows the rarest pieces
 * of the whole collection, not just of the first page.
 */
export function CollectionItemsWithRarity({
  pieces,
  rarityById,
  hasTraits,
  soldIds,
  isOwner,
  creatorName,
  creatorAvatarUrl,
  collection,
  sort,
  sortHrefs,
}: {
  pieces: Listing[];
  rarityById: Record<string, ListingRarity>;
  hasTraits: boolean;
  soldIds: string[];
  isOwner: boolean;
  creatorName: string;
  creatorAvatarUrl?: string | null;
  collection: Pick<Collection, "id" | "title" | "slug">;
  sort: CollectionSort;
  sortHrefs: Record<CollectionSort, string>;
}) {
  const sold = new Set(soldIds);
  if (!pieces.length) return null;

  return (
    <div className="collection-rarity">
      {hasTraits ? (
        <div className="collection-rarity__bar">
          <p className="collection-rarity__method">{RARITY_METHOD_BLURB}</p>
          <div
            className="collection-rarity__sort"
            role="group"
            aria-label="Sort items"
          >
            <Link
              href={sortHrefs.newest}
              scroll={false}
              className={sort === "newest" ? "is-active" : undefined}
              aria-current={sort === "newest" ? "true" : undefined}
            >
              Newest
            </Link>
            <Link
              href={sortHrefs.rarity}
              scroll={false}
              className={sort === "rarity" ? "is-active" : undefined}
              aria-current={sort === "rarity" ? "true" : undefined}
            >
              Rarity
            </Link>
          </div>
        </div>
      ) : null}

      <div className="collection-items-grid">
        {pieces.map((listing) => {
          const rarity = rarityById[listing.id];
          return (
            <WorkCard
              key={listing.id}
              listing={listing}
              showActions
              sold={sold.has(listing.id) || Boolean(listing.delisted)}
              canStageRising={isOwner}
              creatorName={creatorName}
              creatorAvatarUrl={creatorAvatarUrl}
              collection={collection}
              rarityRank={rarity?.rank ?? null}
              rarityScoredSize={rarity?.scoredSize ?? 0}
            />
          );
        })}
      </div>
    </div>
  );
}