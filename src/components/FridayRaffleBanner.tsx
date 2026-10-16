"use client";

import { TREASURY_FRIDAY_COPY } from "@/lib/marketplace/friday-treasury-copy";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

const DISMISS_KEY = "fm-raffle-dismissed-week";
const dismissListeners = new Set<() => void>();

/** ISO-ish week id so a dismissal lasts until next week's raffle. */
function weekId(now = new Date()): string {
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  const week = Math.floor((now.getTime() - start) / (7 * 86_400_000));
  return `${now.getUTCFullYear()}-${week}`;
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === weekId();
  } catch {
    return false;
  }
}

function subscribe(cb: () => void) {
  dismissListeners.add(cb);
  return () => dismissListeners.delete(cb);
}

/** Routes where product chrome (and the raffle banner) should stay out of the way. */
const HIDDEN_PREFIXES = ["/create", "/sign-in", "/sign-up", "/treasury"];

/**
 * Sitewide marketing strip for the weekly Friday treasury raffle.
 * Deep-links to the public treasury hub — not a docs dump.
 */
export function FridayRaffleBanner() {
  const pathname = usePathname() ?? "";
  // Server render: show; client: respect this week's dismissal.
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => false);
  if (dismissed) return null;
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
        <button
          type="button"
          className="fm-raffle-banner__dismiss"
          aria-label="Hide the raffle banner for this week"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, weekId());
            } catch {
              // storage blocked: hide for this page view only
            }
            dismissListeners.forEach((l) => l());
          }}
        >
          {"\u00d7"}
        </button>
      </div>
    </aside>
  );
}
