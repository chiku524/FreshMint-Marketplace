"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; exact?: boolean }[] = [
  { href: "/me", label: "Collection", exact: true },
  { href: "/me/settings", label: "Settings" },
  { href: "/me/security", label: "Security" },
];

export function AccountTabs() {
  const pathname = usePathname() || "/me";

  return (
    <nav className="account-tabs" aria-label="Account">
      {TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`badge${active ? " featured is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
