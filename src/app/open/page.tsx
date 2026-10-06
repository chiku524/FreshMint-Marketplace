import { OpenLaneFilters } from "@/components/OpenLaneFilters";
import { PuzzleRail } from "@/components/PuzzleRail";
import { TreasuryFridayNote } from "@/components/TreasuryFridayNote";
import { WorkCard } from "@/components/WorkCard";
import { isNetworkId } from "@/lib/chains/registry";
import { listClosedPrimarySaleIds } from "@/lib/marketplace/sales";
import { listingMatchesOpenExtras } from "@/lib/marketplace/search";
import { getDiscoveryEngine } from "@/lib/marketplace/service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Open Lane",
  description:
    "Browse the Open Lane: filter by chain, medium, price, and sale mode.",
};

export default async function OpenLanePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const chain = typeof sp.chain === "string" ? sp.chain : undefined;
  const network =
    typeof sp.network === "string" && isNetworkId(sp.network)
      ? sp.network
      : undefined;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const type = typeof sp.type === "string" ? sp.type : undefined;
  const medium = typeof sp.medium === "string" ? sp.medium : undefined;
  const minPrice = typeof sp.minPrice === "string" ? sp.minPrice : undefined;
  const maxPrice = typeof sp.maxPrice === "string" ? sp.maxPrice : undefined;
  const saleModeRaw = typeof sp.saleMode === "string" ? sp.saleMode : undefined;
  const saleMode =
    saleModeRaw === "fixed" ||
    saleModeRaw === "timed_window" ||
    saleModeRaw === "english"
      ? saleModeRaw
      : undefined;
  const endingSoon = sp.endingSoon === "1" || sp.endingSoon === "true";

  const engine = await getDiscoveryEngine();
  const soldIds = await listClosedPrimarySaleIds();
  const rankedRaw = engine.rankOpenLane({
    chain:
      chain === "evm" || chain === "solana" || chain === "boing"
        ? chain
        : undefined,
    network,
    query: q,
    medium,
    minPriceUsd: minPrice ? Number(minPrice) : undefined,
    maxPriceUsd: maxPrice ? Number(maxPrice) : undefined,
    type:
      type === "single" ||
      type === "collection" ||
      type === "open_edition" ||
      type === "auction"
        ? type
        : undefined,
  });
  const ranked = rankedRaw.filter((item) =>
    listingMatchesOpenExtras(item.listing, {
      saleMode,
      endingSoon,
    }),
  );

  return (
    <div className="page-wrap">
      <header className="page-lead">
        <h1 className="display page-lead__title">Open Lane</h1>
        <p className="page-lead__copy">
          Browse soft-launched works across Ethereum, Base, Arbitrum, Optimism,
          Solana, and Boing — ranked lightly by quality, not dump-fed.
        </p>
        <TreasuryFridayNote surface="open" className="page-lead__copy" />
      </header>
      <OpenLaneFilters
        chain={chain}
        network={network}
        q={q}
        type={type}
        medium={medium}
        minPrice={minPrice}
        maxPrice={maxPrice}
        saleMode={saleMode}
        endingSoon={endingSoon ? "1" : undefined}
      />
      <p className="lane-count">{ranked.length} works</p>
      {ranked.length === 0 ? (
        <p className="fm-empty-copy">
          No works match these filters. Clear filters or soft-launch something new.
        </p>
      ) : (
        <PuzzleRail>
          {ranked.map((item) => (
            <WorkCard
              key={item.listing.id}
              listing={item.listing}
              showActions
              sold={soldIds.has(item.listing.id)}
              creatorName={
                engine.state.creators.get(item.listing.creatorId)?.displayName
              }
              creatorAvatarUrl={
                engine.state.creators.get(item.listing.creatorId)?.avatarUrl
              }
              collection={
                item.listing.collectionId
                  ? engine.state.collections.get(item.listing.collectionId) ?? null
                  : null
              }
            />
          ))}
        </PuzzleRail>
      )}
    </div>
  );
}
