import { CreateWizard } from "@/components/CreateWizard";
import { getSessionUser } from "@/lib/auth/session";
import { noIndexMetadata } from "@/lib/seo/site";
import Link from "next/link";
import { Suspense } from "react";

export const metadata = noIndexMetadata(
  "Create",
  "List a work or collection on FreshMint.",
);

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) {
    // Ask for a profile up front instead of letting people fill in several
    // steps and only hit "sign in" when the upload starts.
    const sp = await searchParams;
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (typeof v === "string") qs.set(k, v);
    }
    const next = `/create${qs.toString() ? `?${qs}` : ""}`;
    const enc = encodeURIComponent(next);
    return (
      <div className="page-wrap fm-create-gate">
        <p className="fm-first-run__eyebrow">Create</p>
        <h1 className="display page-lead__title">Sign in to start creating</h1>
        <p className="page-lead__copy">
          Your uploads, drafts and mint progress are saved to your profile, so
          a big collection can be resumed any time. It takes about 30 seconds.
        </p>
        <ol className="fm-first-run__steps">
          <li>
            <span className="fm-first-run__num" aria-hidden="true">1</span>
            <div>
              <strong>Choose what you&apos;re making</strong>
              <span>A 1/1, a collection drop (up to 10,000 pieces) or an auction.</span>
            </div>
          </li>
          <li>
            <span className="fm-first-run__num" aria-hidden="true">2</span>
            <div>
              <strong>Upload and describe</strong>
              <span>Drag in files; titles and traits can be edited in bulk.</span>
            </div>
          </li>
          <li>
            <span className="fm-first-run__num" aria-hidden="true">3</span>
            <div>
              <strong>Mint &amp; publish</strong>
              <span>Connect a wallet at the last step and sign once per batch.</span>
            </div>
          </li>
        </ol>
        <div className="fm-first-run__actions">
          <Link href={`/sign-up?next=${enc}`} className="fm-btn fm-btn--primary">
            Create a profile
          </Link>
          <Link href={`/sign-in?next=${enc}`} className="fm-btn fm-btn--ghost">
            I have a profile
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="create-fullscreen">
      <Suspense
        fallback={
          <p className="create-fullscreen__loading">Loading create wizard{"\u2026"}</p>
        }
      >
        <CreateWizard />
      </Suspense>
    </div>
  );
}