import type { ReactNode } from "react";

/**
 * Shared split shell for creation wizards: live preview (left) + stepped form (right).
 * Layout pattern adapted from Token Ledger sign-up; FreshMint theme and branding only.
 */
export function WizardShell({
  preview,
  children,
  className,
}: {
  preview: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["create-split", className].filter(Boolean).join(" ")}>
      <aside className="create-split__preview" aria-label="Live collection preview">
        {preview}
      </aside>
      <div className="create-split__form">{children}</div>
    </div>
  );
}
