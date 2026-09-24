import { StudioPanel } from "@/components/StudioPanel";
import { getSessionUser } from "@/lib/auth/session";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const user = await getSessionUser();
  const canEdit = user?.role === "editor" || user?.role === "moderator";

  return (
    <div className="page-wrap">
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Studio
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "52ch", marginBottom: "1.5rem" }}>
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
      <StudioPanel canEditFeatured={canEdit} signedIn={Boolean(user)} />
    </div>
  );
}
