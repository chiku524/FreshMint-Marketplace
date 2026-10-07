"use client";

import { TREASURY_FRIDAY_COPY } from "@/lib/marketplace/friday-treasury-copy";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Routes where product chrome (and the raffle banner) should stay out of the way. */
const HIDDEN_PREFIXES = ["/create", "/sign-in", "/sign-up", "/treasury"];

/**
 * Sitewide marketing strip for the weekly Friday treasury raffle.
 * Deep-links to the public treasury hub — not a docs dump.
 */
export function FridayRaffleBanner() {
  const pathname = usePathname() ?? "";
  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  return (
    <aside
      className="fm-raffle-banner"
      data-testid="friday-raffle-banner"
      aria-label={TREASURY_FRIDAY_COPY.bannerTitle}
    >
      <div className="fm-raffle-banner__inner">
        <div className="fm-raffle-banner__copy">
          <p className="fm-raffle-banner__title">{TREASURY_FRIDAY_COPY.bannerTitle}</p>
          <p className="fm-raffle-banner__lead">{TREASURY_FRIDAY_COPY.bannerLead}</p>
        </div>
        <Link
          href={TREASURY_FRIDAY_COPY.bannerHref}
          className="fm-raffle-banner__cta"
        >
          {TREASURY_FRIDAY_COPY.bannerCta}
        </Link>
      </div>
    </aside>
  );
}
