"use client";

import { NAV_GROUP_ICON, NAV_ITEM_ICON, NavGlyph } from "@/components/NavGlyph";
import { NotificationBell } from "@/components/NotificationBell";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

type NavLinkItem = { href: string; label: string };
type NavActionItem = { action: "logout"; label: string };
type NavItem = NavLinkItem | NavActionItem;

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

function isLinkItem(item: NavItem): item is NavLinkItem {
  return "href" in item;
}

/** Slim primary chrome — discovery lanes live on DiscoverySidebar. */
const PRIMARY_GROUPS: NavGroup[] = [
  {
    id: "studio",
    label: "Create",
    items: [
      { href: "/search", label: "Search" },
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
    id: "docs",
    label: "Docs",
    items: [{ href: "/docs", label: "How it works" }],
  },
];

const ACCOUNT_BASE: NavItem[] = [
  { href: "/sign-in", label: "Sign in" },
  { href: "/sign-up", label: "Create profile" },
  { href: "/me", label: "Profile" },
  { href: "/notifications", label: "Notifications" },
  { action: "logout", label: "Sign out" },
];

const OPS_ITEMS: NavLinkItem[] = [
  { href: "/moderate", label: "Moderate" },
  { href: "/metrics", label: "Metrics" },
];

function NavDropdown({
  group,
  closeSignal,
  onLogout,
}: {
  group: NavGroup;
  /** Increments on route change — forces every menu shut. */
  closeSignal: number;
  onLogout?: () => void;
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
        <NavGlyph name={NAV_GROUP_ICON[group.id] ?? group.id} />
        {group.label}
        <span className="site-nav__caret" aria-hidden>
          ▾
        </span>
      </button>
      <div id={menuId} role="menu" className="site-nav__menu">
        <div className="site-nav__menu-panel">
          {group.items.map((item) =>
            isLinkItem(item) ? (
              <Link
                key={item.href}
                href={item.href}
                prefetch={item.href === "/me" ? false : undefined}
                role="menuitem"
                className="site-nav__item"
                onClick={() => {
                  ignoreHoverUntilLeave.current = true;
                  closeMenu();
                }}
              >
                <NavGlyph name={NAV_ITEM_ICON[item.href] ?? "docs"} />
                {item.label}
              </Link>
            ) : (
              <button
                key={item.action}
                type="button"
                role="menuitem"
                className="site-nav__item"
                onClick={() => {
                  ignoreHoverUntilLeave.current = true;
                  closeMenu();
                  onLogout?.();
                }}
              >
                <NavGlyph name={NAV_ITEM_ICON[item.action] ?? "logout"} />
                {item.label}
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

export function SiteNav({
  signedIn: signedInInitial = false,
  area = "primary",
}: {
  signedIn?: boolean;
  area?: "primary" | "account";
}) {
  const pathname = usePathname() || "/";
  const [closeSignal, setCloseSignal] = useState(0);
  const [signedIn, setSignedIn] = useState(signedInInitial);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    setCloseSignal((n) => n + 1);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    function refreshAuth() {
      void fetch("/api/auth/me", { credentials: "include" })
        .then((res) => res.json())
        .then(
          (data: {
            user?: { id?: string; role?: string } | null;
          }) => {
            if (cancelled) return;
            setSignedIn(Boolean(data.user?.id));
            setRole(
              data.user && typeof data.user.role === "string"
                ? data.user.role
                : null,
            );
          },
        )
        .catch(() => {
          if (!cancelled) {
            setSignedIn(false);
            setRole(null);
          }
        });
    }
    refreshAuth();
    window.addEventListener("fm-auth-changed", refreshAuth);
    return () => {
      cancelled = true;
      window.removeEventListener("fm-auth-changed", refreshAuth);
    };
  }, [pathname]);

  function logout() {
    void fetch("/api/auth/logout", { method: "POST" }).finally(() => {
      window.location.assign("/");
    });
  }

  if (area === "primary") {
    return (
      <nav className="site-nav" aria-label="Primary">
        {PRIMARY_GROUPS.map((group) => (
          <NavDropdown
            key={group.id}
            group={group}
            closeSignal={closeSignal}
          />
        ))}
      </nav>
    );
  }

  const showOps = role === "moderator" || role === "editor";
  const accountItems = ACCOUNT_BASE.filter((item) =>
    signedIn
      ? !isLinkItem(item) ||
        item.href === "/me" ||
        item.href === "/notifications"
      : isLinkItem(item) &&
        item.href !== "/me" &&
        item.href !== "/notifications",
  );
  const items: NavItem[] = showOps
    ? [
        ...accountItems.filter((i) => isLinkItem(i)),
        ...OPS_ITEMS,
        ...accountItems.filter((i) => !isLinkItem(i)),
      ]
    : accountItems;

  return (
    <nav className="site-nav site-nav--end" aria-label="Account">
      {signedIn ? <NotificationBell /> : null}
      <NavDropdown
        group={{ id: "account", label: "Account", items }}
        closeSignal={closeSignal}
        onLogout={logout}
      />
    </nav>
  );
}
