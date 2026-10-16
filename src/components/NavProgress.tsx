"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Thin top bar shown from an internal link click until the new route commits,
 * so slow server renders don't feel like a dead tap. Purely decorative.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [active, setActive] = useState(false);

  useEffect(() => {
    // Route committed: hide the bar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(false);
  }, [pathname, search]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setActive(true);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (!active) return;
    // Safety net in case navigation is cancelled.
    const t = window.setTimeout(() => setActive(false), 10000);
    return () => window.clearTimeout(t);
  }, [active]);

  return <div className={`fm-nav-progress${active ? " is-active" : ""}`} aria-hidden="true" />;
}
