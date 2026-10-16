import { EmptyState } from "@/components/EmptyState";
import { DiscoverySessionRecorder } from "@/components/DiscoverySessionRecorder";
import { PuzzleRail } from "@/components/PuzzleRail";
import { RankedWorkCard } from "@/components/WorkCard";
import { getSessionUser } from "@/lib/auth/session";
import { readViewerSession } from "@/lib/discovery/cookies";
import { getDiscoveryEngine } from "@/lib/marketplace/service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Rising",
  description:
    "Fresh work from new and emerging artists, with a guaranteed daily share of the spotlight.",
};

export default async function RisingPage() {
  const engine = await getDiscoveryEngine();
  const user = await getSessionUser();
  const session = await readViewerSession(user?.id ?? null);
  const rising = engine.buildRising(session);

  return (
    <div className="page-wrap">
      <header className="page-lead">
        <h1 className="display page-lead__title">Rising</h1>
        <p className="page-lead__copy">
          New and emerging artists, given a guaranteed share of the spotlight
          every day so fresh work gets seen — not just the biggest names.
        </p>
      </header>
      {rising.length === 0 ? (
        <EmptyState
          title="Nothing rising yet"
          body="Newly published works appear here automatically. Publish your first piece to get it in front of collectors."
          actions={[
            { href: "/create", label: "Create a work" },
            { href: "/open", label: "Browse all works", variant: "ghost" },
          ]}
        />
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
