import { StudioPanel } from "@/components/StudioPanel";
import { getSessionUser } from "@/lib/auth/session";
import { buildStudioCollectionRows } from "@/lib/marketplace/studio-hub";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import { noIndexMetadata } from "@/lib/seo/site";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = noIndexMetadata("Studio");

export default async function StudioPage() {
  const user = await getSessionUser();
  const canEdit = user?.role === "editor" || user?.role === "moderator";

  let collections: ReturnType<typeof buildStudioCollectionRows> = [];
  if (user) {
    const engine = await getDiscoveryEngine();
    const owned = [...engine.state.collections.values()].filter(
      (c) => c.creatorId === user.id,
    );
    const listings = [...engine.state.listings.values()];
    collections = buildStudioCollectionRows({ collections: owned, listings });
  }

  const attention = collections.filter((c) => c.needsAttention).length;

  return (
    <div className="page-wrap">
      <header className="page-lead">
        <h1 className="display page-lead__title">Studio</h1>
        <p className="page-lead__copy">
          Manage your collections through draft → deploy → mint → live. Finish
          incomplete publishes, add works, or open a live set.{" "}
          {user ? (
            <>
              Minted collections also show on{" "}
              <Link href="/me">your profile</Link>
              {attention > 0
                ? ` · ${attention} still need a next step`
                : null}
              .
            </>
          ) : (
            <>
              <Link href="/sign-in?next=/studio">Sign in</Link> to manage your
              work.
            </>
          )}
        </p>
        {canEdit ? (
          <p className="page-lead__copy">
            Editorial Featured controls are available for your role below.
          </p>
        ) : null}
      </header>
      <StudioPanel
        collections={collections}
        canEditFeatured={canEdit}
        signedIn={Boolean(user)}
      />
    </div>
  );
}
