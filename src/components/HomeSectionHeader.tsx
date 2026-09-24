import Link from "next/link";
import type { ReactNode } from "react";

export function HomeSectionHeader({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel = "View all",
}: {
  title: string;
  subtitle?: ReactNode;
  viewAllHref: string;
  viewAllLabel?: string;
}) {
  return (
    <div className="fm-home-section-head">
      <div>
        <h2 className="display fm-home-section-title">{title}</h2>
        {subtitle ? (
          <p className="fm-home-section-subtitle">{subtitle}</p>
        ) : null}
      </div>
      <Link href={viewAllHref} className="fm-home-section-viewall">
        {viewAllLabel}
      </Link>
    </div>
  );
}
