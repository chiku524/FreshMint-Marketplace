import { StudioPanel } from "@/components/StudioPanel";
import { getSessionUser } from "@/lib/auth/session";
import { noIndexMetadata } from "@/lib/seo/site";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = noIndexMetadata("Studio");

export default async function StudioPage() {
  const user = await getSessionUser();
  const canEdit = user?.role === "editor" || user?.role === "moderator";

  return (
    <div className="page-wrap">
      <header className="page-lead">
        <h1 className="display page-lead__title">Studio</h1>
        <p className="page-lead__copy">
          Collector shelves amplify Emerging work.{" "}
          {canEdit
            ? "Editorial Featured controls are available for your role."
            : "Editorial Featured pins are limited to editors and moderators."}{" "}
          {!user ? (
            <>
              <Link href="/sign-in?next=/studio">Sign in</Link> to curate a shelf.
            </>
          ) : null}
        </p>
      </header>
      <StudioPanel canEditFeatured={canEdit} signedIn={Boolean(user)} />
    </div>
  );
}
