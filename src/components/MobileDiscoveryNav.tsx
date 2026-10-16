"use client";

import { BROWSE_LINKS, DISCOVER_LINKS, isDiscoveryActive } from "@/components/DiscoverySidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Phones / touch devices have no hover rail, so the discovery lanes were
 * unreachable there. A swipeable chip row keeps them one tap away.
 */
export function MobileDiscoveryNav() {
  const pathname = usePathname() || "/";
  if (pathname.startsWith("/create") || pathname.startsWith("/sign-")) return null;
  const items = [...BROWSE_LINKS, ...DISCOVER_LINKS];
  return (
    <nav className="fm-mobile-lanes" aria-label="Browse">
      <ul>
        {items.map((item) => {
          const active = isDiscoveryActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`fm-mobile-lanes__chip${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}