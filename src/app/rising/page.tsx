import { DiscoverySessionRecorder } from "@/components/DiscoverySessionRecorder";
import { PuzzleRail } from "@/components/PuzzleRail";
import { RankedWorkCard } from "@/components/WorkCard";
import { getSessionUser } from "@/lib/auth/session";
import { emergingShare } from "@/lib/discovery";
import { readViewerSession } from "@/lib/discovery/cookies";
import { getDiscoveryEngine } from "@/lib/marketplace/service";

export const dynamic = "force-dynamic";

export default async function RisingPage() {
  const engine = await getDiscoveryEngine();
  const user = await getSessionUser();
  const session = await readViewerSession(user?.id ?? null);
  const rising = engine.buildRising(session);
  const share = emergingShare(rising);
  const budgets = engine.getBudgets();

  return (
    <div style={{ padding: "2.5rem clamp(1rem, 4vw, 3rem) 4rem" }}>
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Rising
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "52ch", marginBottom: "1.75rem" }}>
        Fairness-aware discovery with a hard Emerging quota (
        {Math.round(budgets.risingEmergingReserved)} of {budgets.risingTotal}{" "}
        daily slots reserved, {budgets.risingExplore} explore). Current Emerging
        share:{" "}
        <strong style={{ color: "var(--emergent)" }}>
          {(share * 100).toFixed(0)}%
        </strong>
        .
      </p>
      {rising.length === 0 ? (
        <p style={{ color: "var(--ink-muted)" }}>
          Rising is empty right now — soft-launch works and push them to Rising
          eligibility.
        </p>
      ) : (
        <>
          <DiscoverySessionRecorder
            listingIds={rising.map((item) => item.listing.id)}
            artistIds={rising.map((item) => item.listing.creatorId)}
            collectionIds={rising
              .map((item) => item.listing.collectionId)
              .filter((id): id is string => !!id)}
          />
          <PuzzleRail>
            {rising.map((item) => (
              <RankedWorkCard
                key={item.listing.id}
                item={item}
                creatorName={
                  engine.state.creators.get(item.listing.creatorId)?.displayName
                }
              />
            ))}
          </PuzzleRail>
        </>
      )}
    </div>
  );
}
