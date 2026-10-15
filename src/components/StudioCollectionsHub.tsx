import { PublishLifecycleStatus } from "@/components/PublishLifecycleStatus";
import type { StudioCollectionRow } from "@/lib/marketplace/studio-hub";
import Link from "next/link";

function pieceSummary(row: StudioCollectionRow): string {
  const bits: string[] = [];
  if (row.liveCount > 0) {
    bits.push(`${row.liveCount} live`);
  }
  if (row.mintedDraftCount > 0) {
    bits.push(`${row.mintedDraftCount} minted draft${row.mintedDraftCount === 1 ? "" : "s"}`);
  }
  if (row.unmintedDraftCount > 0) {
    bits.push(
      `${row.unmintedDraftCount} unminted draft${row.unmintedDraftCount === 1 ? "" : "s"}`,
    );
  }
  if (bits.length === 0) return "No pieces yet";
  return bits.join(" · ");
}

export function StudioCollectionsHub({
  rows,
  signedIn,
}: {
  rows: StudioCollectionRow[];
  signedIn: boolean;
}) {
  if (!signedIn) {
    return (
      <section className="studio-hub" data-testid="studio-collections-hub">
        <header className="studio-hub__header">
          <h2 className="display studio-hub__title">Your collections</h2>
          <p className="studio-hub__lead">
            Sign in to see draft → deploy → mint → live status and finish
            incomplete publishes.
          </p>
        </header>
        <p className="fm-empty-copy">
          <Link href="/sign-in?next=/studio">Sign in</Link> to open Studio, or{" "}
          <Link href="/create">start a collection</Link>.
        </p>
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section className="studio-hub" data-testid="studio-collections-hub">
        <header className="studio-hub__header">
          <h2 className="display studio-hub__title">Your collections</h2>
          <p className="studio-hub__lead">
            Studio tracks every collection from draft through live on Open Lane.
          </p>
        </header>
        <div className="fm-empty-state">
          <h3 className="display fm-empty-state__title">Nothing in progress</h3>
          <p className="fm-empty-copy" style={{ marginTop: "0.5rem" }}>
            Name a collection, deploy the contract, mint pieces, then soft-launch.
            Minted collections also appear on{" "}
            <Link href="/me">your profile</Link>.
          </p>
          <p style={{ marginTop: "1rem" }}>
            <Link href="/create" className="fm-btn fm-btn--primary">
              Publish a collection
            </Link>
          </p>
        </div>
      </section>
    );
  }

  const attention = rows.filter((r) => r.needsAttention).length;

  return (
    <section className="studio-hub" data-testid="studio-collections-hub">
      <header className="studio-hub__header">
        <div>
          <h2 className="display studio-hub__title">Your collections</h2>
          <p className="studio-hub__lead">
            {attention > 0
              ? `${attention} need${attention === 1 ? "s" : ""} a next step · ${rows.length} total`
              : `${rows.length} collection${rows.length === 1 ? "" : "s"} · all caught up`}
          </p>
        </div>
        <Link href="/create" className="fm-btn fm-btn--ghost">
          New collection
        </Link>
      </header>

      <ul className="studio-hub__list">
        {rows.map((row) => (
          <li
            key={row.id}
            className={`studio-hub__row${row.needsAttention ? " is-attention" : ""}`}
            data-phase={row.phase}
          >
            <div className="studio-hub__media" aria-hidden>
              {row.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- creator media URLs vary (Blob / local)
                <img src={row.coverUrl} alt="" />
              ) : (
                <span className="studio-hub__media-fallback" />
              )}
            </div>

            <div className="studio-hub__body">
              <div className="studio-hub__topline">
                <Link href={row.href} className="display studio-hub__name">
                  {row.title}
                </Link>
                <span
                  className={`badge studio-hub__phase${row.needsAttention ? " emerging" : ""}`}
                >
                  {row.phaseLabel}
                </span>
              </div>
              <p className="studio-hub__meta">
                {row.networkLabel}
                {" · "}
                {pieceSummary(row)}
              </p>
              <p className="studio-hub__summary">{row.summary}</p>
              {row.needsAttention ? (
                <div className="studio-hub__rail">
                  <PublishLifecycleStatus
                    snapshot={row.lifecycle}
                    compact
                    title={`${row.title} publish status`}
                    testId={`studio-lifecycle-${row.id}`}
                  />
                </div>
              ) : null}
              <div className="studio-hub__actions">
                <Link
                  href={row.primaryAction.href}
                  className="fm-btn fm-btn--primary"
                >
                  {row.primaryAction.label}
                </Link>
                {row.secondaryActions.slice(0, 2).map((action) => (
                  <Link
                    key={action.id}
                    href={action.href}
                    className="fm-btn fm-btn--ghost"
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
