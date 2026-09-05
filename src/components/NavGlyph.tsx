import type { ReactNode } from "react";

const ICONS: Record<string, ReactNode> = {
  discover: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.2l2.1 6.3-2.1-1.2-2.1 1.2Z" />
    </>
  ),
  studio: (
    <>
      <path d="M5 20l1.2-4.2L15 7a2.1 2.1 0 113 3L9.2 18.8 5 20z" />
      <path d="M13.6 8.4l2 2" />
    </>
  ),
  funds: (
    <>
      <path d="M4 8h11" />
      <path d="M12 5l3 3-3 3" />
      <path d="M20 16H9" />
      <path d="M12 13l-3 3 3 3" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8.2" r="3.1" />
      <path d="M5.2 19.4c1.4-3.4 3.8-5.1 6.8-5.1s5.4 1.7 6.8 5.1" />
    </>
  ),
  ops: (
    <>
      <path d="M4 13a8 8 0 1114.2 5" />
      <path d="M12 13l3.4-3.4" />
      <path d="M12 7.2V9" />
    </>
  ),
  rising: (
    <>
      <path d="M4 16.5l5.2-5.2 3.1 3.1L20 7" />
      <path d="M14.2 7H20v5.8" />
    </>
  ),
  open: (
    <>
      <rect x="4.5" y="4.5" width="15" height="15" rx="2" />
      <path d="M4.5 10h15M4.5 14h15M10 4.5v15" />
    </>
  ),
  featured: (
    <path d="M12 4.5l2.1 4.5 5 .7-3.6 3.4.9 4.9L12 15.8 7.6 18l.9-4.9L4.9 9.7l5-.7Z" />
  ),
  auctions: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.4l2.6 1.6" />
    </>
  ),
  calendar: (
    <>
      <rect x="4.5" y="5.5" width="15" height="14" rx="2" />
      <path d="M8 4v3M16 4v3M4.5 10h15" />
    </>
  ),
  collections: (
    <>
      <path d="M5 8.2l7-3.2 7 3.2-7 3.2Z" />
      <path d="M5 12l7 3.2L19 12" />
      <path d="M5 15.8L12 19l7-3.2" />
    </>
  ),
  shelves: (
    <>
      <path d="M4.5 7h15M4.5 12h15M4.5 17h15" />
      <path d="M7 5v14M17 5v14" />
    </>
  ),
  docs: (
    <>
      <path d="M7 4.5h7.2L19 9.2V19.5H7z" />
      <path d="M14.2 4.5V9.2H19" />
      <path d="M9.4 12.4h5.2M9.4 15.4h3.6" />
    </>
  ),
  create: (
    <>
      <rect x="4.5" y="4.5" width="15" height="15" rx="2.2" />
      <path d="M12 8.2v7.6M8.2 12h7.6" />
    </>
  ),
  panel: (
    <>
      <rect x="4.5" y="4.5" width="15" height="15" rx="2" />
      <path d="M9.2 4.5v15M12.6 9h4.4M12.6 13h4.4" />
    </>
  ),
  bridge: (
    <>
      <path d="M4 12h16" />
      <path d="M8 8L4 12l4 4" />
      <path d="M16 8l4 4-4 4" />
    </>
  ),
  signin: (
    <>
      <path d="M13.5 12H4" />
      <path d="M10.2 8.6 13.6 12l-3.4 3.4" />
      <path d="M15.4 5.4H19v13.2h-3.6" />
    </>
  ),
  signup: (
    <>
      <circle cx="10.2" cy="8.2" r="2.8" />
      <path d="M4.8 18.6c1.2-3 3.2-4.5 5.4-4.5s4.2 1.5 5.4 4.5" />
      <path d="M18 8v5.2M15.4 10.6H20.6" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8.2" r="3.1" />
      <path d="M5.2 19.4c1.4-3.4 3.8-5.1 6.8-5.1s5.4 1.7 6.8 5.1" />
    </>
  ),
  logout: (
    <>
      <path d="M10.5 12H20" />
      <path d="M16.6 8.6 20 12l-3.4 3.4" />
      <path d="M8.6 5.4H5v13.2h3.6" />
    </>
  ),
  moderate: (
    <path d="M12 4.4l7 3v5.4c0 4.2-2.9 7.2-7 8.4-4.1-1.2-7-4.2-7-8.4V7.4Z" />
  ),
  metrics: (
    <>
      <path d="M5 19V10.5" />
      <path d="M12 19V5.5" />
      <path d="M19 19v-6.2" />
    </>
  ),
};

export function NavGlyph({ name }: { name: string }) {
  const inner = ICONS[name];
  if (!inner) return null;
  return (
    <svg
      className="site-nav__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {inner}
    </svg>
  );
}

export const NAV_GROUP_ICON: Record<string, string> = {
  discover: "discover",
  studio: "studio",
  funds: "funds",
  account: "account",
  ops: "ops",
};

export const NAV_ITEM_ICON: Record<string, string> = {
  "/rising": "rising",
  "/open": "open",
  "/featured": "featured",
  "/auctions": "auctions",
  "/calendar": "calendar",
  "/collections": "collections",
  "/shelves": "shelves",
  "/docs": "docs",
  "/create": "create",
  "/studio": "panel",
  "/bridge": "bridge",
  "/sign-in": "signin",
  "/sign-up": "signup",
  "/me": "profile",
  logout: "logout",
  "/moderate": "moderate",
  "/metrics": "metrics",
};
