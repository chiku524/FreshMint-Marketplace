"use client";

import { NavGlyph } from "@/components/NavGlyph";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type DiscoveryLink = {
  href: string;
  label: string;
  icon: string;
};

/** Primary product IA — SiteNav stays free of these lane duplicates. */
const BROWSE: DiscoveryLink[] = [
  { href: "/collections", label: "Collections", icon: "collections" },
  { href: "/creators", label: "Creators", icon: "account" },
];

const DISCOVER: DiscoveryLink[] = [
  { href: "/open", label: "Open Lane", icon: "open" },
  { href: "/rising", label: "Rising", icon: "rising" },
  { href: "/featured", label: "Featured", icon: "featured" },
  { href: "/trending", label: "Most viewed", icon: "trending" },
  { href: "/auctions", label: "Timed drops", icon: "auctions" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/shelves", label: "Shelves", icon: "shelves" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function DiscoveryGroup({
  heading,
  items,
  pathname,
}: {
  heading: string;
  items: DiscoveryLink[];
  pathname: string;
}) {
  return (
    <div className="discovery-rail__group">
      <h2 className="discovery-rail__heading">{heading}</h2>
      <ul className="discovery-rail__list">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`discovery-rail__link${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className="discovery-rail__icon-slot">
                  <NavGlyph name={item.icon} />
                </span>
                <span className="discovery-rail__label">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DiscoverySidebar() {
  const pathname = usePathname() || "/";
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const header = document.querySelector<HTMLElement>(".site-header");

    const apply = () => {
      const bottom = header?.getBoundingClientRect().bottom ?? 0;
      root.style.setProperty(
        "--discovery-rail-top",
        `${Math.max(0, bottom)}px`,
      );
    };

    apply();
    window.addEventListener("scroll", apply, { passive: true });
    window.addEventListener("resize", apply);
    const observer = header ? new ResizeObserver(apply) : null;
    if (header && observer) observer.observe(header);
    return () => {
      window.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      observer?.disconnect();
    };
  }, []);

  return (
    <aside ref={rootRef} className="discovery-rail">
      <div className="discovery-rail__scrim" aria-hidden="true" />
      <div className="discovery-rail__panel">
        <nav className="discovery-rail__nav" aria-label="Discovery">
          <DiscoveryGroup heading="Browse" items={BROWSE} pathname={pathname} />
          <DiscoveryGroup
            heading="Discover"
            items={DISCOVER}
            pathname={pathname}
          />
        </nav>
      </div>
    </aside>
  );
}
