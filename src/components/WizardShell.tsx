import Link from "next/link";
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
      <div className="create-split__form">
        <div className="create-split__form-bar">
          <Link href="/" className="create-split__home">
            FreshMint
          </Link>
          <span className="create-split__form-label">Create</span>
        </div>
        {children}
      </div>
    </div>
  );
}
