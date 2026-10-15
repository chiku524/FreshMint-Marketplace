"use client";

import { WorkCard } from "@/components/WorkCard";
import type { Collection, Listing } from "@/lib/discovery/types";
import {
  RARITY_METHOD_BLURB,
  type ListingRarity,
} from "@/lib/marketplace/rarity";
import { useMemo, useState } from "react";

type SortMode = "newest" | "rarity";

export function CollectionItemsWithRarity({
  pieces,
  rarityById,
  hasTraits,
  soldIds,
  isOwner,
  creatorName,
  creatorAvatarUrl,
  collection,
}: {
  pieces: Listing[];
  rarityById: Record<string, ListingRarity>;
  hasTraits: boolean;
  soldIds: string[];
  isOwner: boolean;
  creatorName: string;
  creatorAvatarUrl?: string | null;
  collection: Pick<Collection, "id" | "title" | "slug">;
}) {
  const [sort, setSort] = useState<SortMode>("newest");
  const sold = useMemo(() => new Set(soldIds), [soldIds]);

  const ordered = useMemo(() => {
    if (!hasTraits || sort !== "rarity") {
      return pieces;
    }
    return [...pieces].sort((a, b) => {
      const ra = rarityById[a.id];
      const rb = rarityById[b.id];
      const rankA = ra?.rank ?? Number.POSITIVE_INFINITY;
      const rankB = rb?.rank ?? Number.POSITIVE_INFINITY;
      if (rankA !== rankB) return rankA - rankB;
      return b.createdAt - a.createdAt;
    });
  }, [pieces, rarityById, hasTraits, sort]);

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
            <button
              type="button"
              className={sort === "newest" ? "is-active" : undefined}
              aria-pressed={sort === "newest"}
              onClick={() => setSort("newest")}
            >
              Newest
            </button>
            <button
              type="button"
              className={sort === "rarity" ? "is-active" : undefined}
              aria-pressed={sort === "rarity"}
              onClick={() => setSort("rarity")}
            >
              Rarity
            </button>
          </div>
        </div>
      ) : null}

      <div className="collection-items-grid">
        {ordered.map((listing) => {
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
