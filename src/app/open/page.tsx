import { WorkCard } from "@/components/WorkCard";
import { OpenLaneFilters } from "@/components/OpenLaneFilters";
import { getDiscoveryEngine } from "@/lib/marketplace/service";

export const dynamic = "force-dynamic";

export default async function OpenLanePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const chain = typeof sp.chain === "string" ? sp.chain : undefined;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const type = typeof sp.type === "string" ? sp.type : undefined;

  const engine = await getDiscoveryEngine();
  const items = engine.buildOpenLane({
    chain: chain === "evm" || chain === "solana" ? chain : undefined,
    query: q,
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
        Permissionless browse across EVM and Solana. Soft-launched works appear
        here — not dumped onto the homepage firehose.
      </p>
      <OpenLaneFilters chain={chain} q={q} type={type} />
      <p style={{ color: "var(--ink-muted)", margin: "1rem 0 1.5rem" }}>
        {items.length} works
      </p>
      <div className="lane-rail">
        {items.map((listing) => (
          <WorkCard key={listing.id} listing={listing} showActions />
        ))}
      </div>
    </div>
  );
}
