import { PuzzleRail } from "@/components/PuzzleRail";
import { RankedWorkCard } from "@/components/WorkCard";
import { getDiscoveryEngine } from "@/lib/marketplace/service";

export const dynamic = "force-dynamic";

export default async function FeaturedPage() {
  const engine = await getDiscoveryEngine();
  const featured = engine.buildFeatured();
  const budgets = engine.getBudgets();

  return (
    <div style={{ padding: "2.5rem clamp(1rem, 4vw, 3rem) 4rem" }}>
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Featured
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "52ch", marginBottom: "1.75rem" }}>
        Fixed editorial / curator inventory ({budgets.featuredTotal} slots/day).
        Featured dominance does not buy Rising monopoly — Emerging Rising stays
        algorithmically reserved.
      </p>
      <PuzzleRail>
        {featured.map((item) => (
          <RankedWorkCard key={item.listing.id} item={item} />
        ))}
      </PuzzleRail>
    </div>
  );
}
