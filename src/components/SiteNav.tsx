"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

type NavItem = { href: string; label: string };

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const GROUPS: NavGroup[] = [
  {
    id: "discover",
    label: "Discover",
    items: [
      { href: "/rising", label: "Rising" },
      { href: "/open", label: "Open Lane" },
      { href: "/featured", label: "Featured" },
      { href: "/auctions", label: "Auctions" },
      { href: "/calendar", label: "Calendar" },
      { href: "/shelves", label: "Shelves" },
    ],
  },
  {
    id: "studio",
    label: "Studio",
    items: [
      { href: "/create", label: "Create" },
      { href: "/studio", label: "Studio" },
    ],
  },
  {
    id: "funds",
    label: "Funds",
    items: [{ href: "/bridge", label: "Bridge" }],
  },
  {
    id: "account",
    label: "Account",
    items: [
      { href: "/me", label: "Profile & assets" },
      { href: "/me/security", label: "Security (2FA)" },
    ],
  },
  {
    id: "ops",
    label: "Ops",
    items: [
      { href: "/moderate", label: "Moderate" },
      { href: "/metrics", label: "Metrics" },
      { href: "/docs", label: "Docs" },
    ],
  },
];

function NavDropdown({ group }: { group: NavGroup }) {
  const [pinned, setPinned] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!pinned) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setPinned(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPinned(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  return (
    <div
      ref={rootRef}
      className={`site-nav__dropdown${pinned ? " is-open" : ""}`}
    >
      <button
        type="button"
        className="site-nav__trigger"
        aria-expanded={pinned}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setPinned((v) => !v)}
      >
        {group.label}
        <span className="site-nav__caret" aria-hidden>
          ▾
        </span>
      </button>
      <div id={menuId} role="menu" className="site-nav__menu">
        <div className="site-nav__menu-panel">
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              className="site-nav__item"
              onClick={() => setPinned(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SiteNav() {
  return (
    <nav className="site-nav" aria-label="Primary">
      {GROUPS.map((group) => (
        <NavDropdown key={group.id} group={group} />
      ))}
    </nav>
  );
}
