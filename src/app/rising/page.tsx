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
    <div className="page-wrap">
      <header className="page-lead">
        <h1 className="display page-lead__title">Rising</h1>
        <p className="page-lead__copy">
          Fairness-aware discovery with a hard Emerging quota (
          {Math.round(budgets.risingEmergingReserved)} of {budgets.risingTotal}{" "}
          daily slots reserved, {budgets.risingExplore} explore). Current Emerging
          share:{" "}
          <strong style={{ color: "var(--emergent)" }}>
            {(share * 100).toFixed(0)}%
          </strong>
          .
        </p>
      </header>
      {rising.length === 0 ? (
        <p className="fm-empty-copy">
          Rising is empty right now — publish a minted work and it enters
          Rising automatically when quality gates pass. Your first work skips
          the new-wallet wait.
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
                creatorAvatarUrl={
                  engine.state.creators.get(item.listing.creatorId)?.avatarUrl
                }
              />
            ))}
          </PuzzleRail>
        </>
      )}
    </div>
  );
}
