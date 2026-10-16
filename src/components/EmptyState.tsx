import Link from "next/link";

export type EmptyStateAction = {
  href: string;
  label: string;
  variant?: "primary" | "ghost";
};

/**
 * One consistent empty state: plain-language title, one or two sentences,
 * and at most two next steps. Used across lanes while the marketplace fills up.
 */
export function EmptyState({
  title,
  body,
  actions = [],
  compact = false,
}: {
  title: string;
  body: React.ReactNode;
  actions?: EmptyStateAction[];
  compact?: boolean;
}) {
  return (
    <div className={`fm-empty-state${compact ? " fm-empty-state--compact" : ""}`} role="status">
      <p className="fm-empty-state__title">{title}</p>
      <p className="fm-empty-state__body">{body}</p>
      {actions.length ? (
        <div className="fm-empty-state__actions">
          {actions.map((a) => (
            <Link
              key={a.href + a.label}
              href={a.href}
              className={`fm-btn ${a.variant === "ghost" ? "fm-btn--ghost" : "fm-btn--primary"}`}
            >
              {a.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}