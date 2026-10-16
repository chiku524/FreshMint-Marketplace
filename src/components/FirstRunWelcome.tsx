import Link from "next/link";

/**
 * Shown on the home page while the marketplace has no published work yet.
 * Turns an empty page into a clear "be one of the first creators" path.
 */
export function FirstRunWelcome({ signedIn }: { signedIn: boolean }) {
  const startHref = signedIn ? "/create" : "/sign-up?next=/create";
  return (
    <section className="fm-first-run site-section" aria-labelledby="fm-first-run-title">
      <p className="fm-first-run__eyebrow">Just opened</p>
      <h2 id="fm-first-run-title" className="fm-first-run__title">
        Be one of the first creators on FreshMint
      </h2>
      <p className="fm-first-run__lede">
        New work gets a guaranteed share of screen time in the Emerging lane, so
        early pieces are seen, not buried.
      </p>
      <ol className="fm-first-run__steps">
        <li>
          <span className="fm-first-run__num" aria-hidden="true">1</span>
          <div>
            <strong>Create a profile</strong>
            <span>Google or email, about 30 seconds. Connect a wallet later.</span>
          </div>
        </li>
        <li>
          <span className="fm-first-run__num" aria-hidden="true">2</span>
          <div>
            <strong>Upload your art</strong>
            <span>One piece or a whole collection, up to 10,000 files.</span>
          </div>
        </li>
        <li>
          <span className="fm-first-run__num" aria-hidden="true">3</span>
          <div>
            <strong>Mint &amp; publish</strong>
            <span>Sign once per batch with your wallet; your work goes live right after.</span>
          </div>
        </li>
      </ol>
      <div className="fm-first-run__actions">
        <Link href={startHref} className="fm-btn fm-btn--primary">
          Start creating
        </Link>
        <Link href="/docs#discovery" className="fm-btn fm-btn--ghost">
          How discovery works
        </Link>
      </div>
      <p className="fm-first-run__collector">
        Here to collect? Pick a few tastes below and new work will show up here as soon as it lands.
      </p>
    </section>
  );
}