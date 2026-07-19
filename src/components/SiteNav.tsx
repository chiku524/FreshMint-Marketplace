"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

function NavDropdown({
  group,
  closeSignal,
}: {
  group: NavGroup;
  /** Increments on route change — forces every menu shut. */
  closeSignal: number;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const ignoreHoverUntilLeave = useRef(false);
  const menuId = useId();

  function closeMenu() {
    setOpen(false);
    const active = document.activeElement;
    if (active instanceof HTMLElement && rootRef.current?.contains(active)) {
      active.blur();
    }
  }

  useEffect(() => {
    ignoreHoverUntilLeave.current = true;
    closeMenu();
  }, [closeSignal]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`site-nav__dropdown${open ? " is-open" : ""}`}
      onMouseEnter={() => {
        if (ignoreHoverUntilLeave.current) return;
        setOpen(true);
      }}
      onMouseLeave={() => {
        ignoreHoverUntilLeave.current = false;
        closeMenu();
      }}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="site-nav__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => {
          ignoreHoverUntilLeave.current = false;
          setOpen((v) => !v);
        }}
        onFocus={() => {
          if (ignoreHoverUntilLeave.current) return;
          setOpen(true);
        }}
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
              onClick={() => {
                ignoreHoverUntilLeave.current = true;
                closeMenu();
              }}
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
  const pathname = usePathname() || "/";
  const [closeSignal, setCloseSignal] = useState(0);

  useEffect(() => {
    setCloseSignal((n) => n + 1);
  }, [pathname]);

  return (
    <nav className="site-nav" aria-label="Primary">
      {GROUPS.map((group) => (
        <NavDropdown
          key={group.id}
          group={group}
          closeSignal={closeSignal}
        />
      ))}
    </nav>
  );
}
