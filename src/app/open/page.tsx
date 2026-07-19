import { OpenLaneFilters } from "@/components/OpenLaneFilters";
import { PuzzleRail } from "@/components/PuzzleRail";
import { WorkCard } from "@/components/WorkCard";
import { isNetworkId } from "@/lib/chains/registry";
import { getDiscoveryEngine } from "@/lib/marketplace/service";

export const dynamic = "force-dynamic";

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

  const engine = await getDiscoveryEngine();
  const items = engine.buildOpenLane({
    chain: chain === "evm" || chain === "solana" ? chain : undefined,
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

  return (
    <div style={{ padding: "2.5rem clamp(1rem, 4vw, 3rem) 4rem" }}>
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Open Lane
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "52ch", marginBottom: "1.25rem" }}>
        Permissionless browse across Ethereum, Base, Arbitrum, Optimism, and Solana.
        Soft-launched works appear here — not dumped onto the homepage firehose.
      </p>
      <OpenLaneFilters
        chain={chain}
        network={network}
        q={q}
        type={type}
        medium={medium}
        minPrice={minPrice}
        maxPrice={maxPrice}
      />
      <p style={{ color: "var(--ink-muted)", margin: "1rem 0 1.5rem" }}>
        {items.length} works
      </p>
      {items.length === 0 ? (
        <p style={{ color: "var(--ink-muted)" }}>
          No works match these filters. Clear filters or soft-launch something new.
        </p>
      ) : (
        <PuzzleRail>
          {items.map((listing) => (
            <WorkCard
              key={listing.id}
              listing={listing}
              showActions
              creatorName={
                engine.state.creators.get(listing.creatorId)?.displayName
              }
            />
          ))}
        </PuzzleRail>
      )}
    </div>
  );
}
