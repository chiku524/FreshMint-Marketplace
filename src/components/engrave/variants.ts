export type EngraveVariant =
  | "home"
  | "rising"
  | "open"
  | "featured"
  | "auctions"
  | "calendar"
  | "shelves"
  | "create"
  | "studio"
  | "bridge"
  | "me"
  | "security"
  | "listing"
  | "creator"
  | "metrics"
  | "docs"
  | "moderate"
  | "default";

/** Stable numeric seed per plate — drives motif placement. */
export const VARIANT_SEEDS: Record<Exclude<EngraveVariant, "home">, number> = {
  rising: 0x71a3c2e1,
  open: 0x4b91d07a,
  featured: 0x9e2f18c4,
  auctions: 0x33d8a6b5,
  calendar: 0xc07e5f19,
  shelves: 0x58b2e043,
  create: 0xa1d49c6e,
  studio: 0x6f30b8d2,
  bridge: 0x2c87e1af,
  me: 0x84f5a023,
  security: 0xd16c4b97,
  listing: 0x5e9a72d0,
  creator: 0xb3481ef6,
  metrics: 0x07c6d8a4,
  docs: 0xe2a05b3c,
  moderate: 0x19f47e81,
  default: 0xabcdef12,
};

export function variantFromPathname(pathname: string): EngraveVariant {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/rising")) return "rising";
  if (pathname.startsWith("/open")) return "open";
  if (pathname.startsWith("/featured")) return "featured";
  if (pathname.startsWith("/auctions")) return "auctions";
  if (pathname.startsWith("/calendar")) return "calendar";
  if (pathname.startsWith("/shelves")) return "shelves";
  if (pathname.startsWith("/create")) return "create";
  if (pathname.startsWith("/studio")) return "studio";
  if (pathname.startsWith("/bridge")) return "bridge";
  if (pathname.startsWith("/me/security")) return "security";
  if (pathname.startsWith("/me")) return "me";
  if (pathname.startsWith("/listings/")) return "listing";
  if (pathname.startsWith("/creators/")) return "creator";
  if (pathname.startsWith("/metrics")) return "metrics";
  if (pathname.startsWith("/docs")) return "docs";
  if (pathname.startsWith("/moderate")) return "moderate";
  return "default";
}
