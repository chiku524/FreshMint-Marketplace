import type { PublishLifecycleSnapshot } from "@/lib/marketplace/publish-status";

/**
 * Draft → Deploy → Mint → Live step rail.
 * Matches FreshMint create-wizard step chrome (serif uppercase, emergent accents).
 */
export function PublishLifecycleStatus({
  snapshot,
  title = "Publish status",
  compact = false,
  testId = "publish-lifecycle-status",
}: {
  snapshot: PublishLifecycleSnapshot;
  title?: string;
  compact?: boolean;
  testId?: string;
}) {
  return (
    <section
      className={`publish-lifecycle${compact ? " publish-lifecycle--compact" : ""}`}
      data-testid={testId}
      aria-label={title}
    >
      {!compact ? (
        <h3 className="display publish-lifecycle__title">{title}</h3>
      ) : null}
      <ol className="publish-lifecycle__steps">
        {snapshot.steps.map((step, index) => (
          <li
            key={step.id}
            className={`publish-lifecycle__step is-${step.status}`}
            aria-current={step.status === "current" ? "step" : undefined}
          >
            <span className="publish-lifecycle__index" aria-hidden>
              {step.status === "done" ? "✓" : index + 1}
            </span>
            <span className="publish-lifecycle__copy">
              <span className="publish-lifecycle__label">{step.short}</span>
              {!compact ? (
                <span className="publish-lifecycle__detail">{step.detail}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
      <p className="publish-lifecycle__summary" role="status" aria-live="polite">
        {snapshot.summary}
      </p>
    </section>
  );
}
