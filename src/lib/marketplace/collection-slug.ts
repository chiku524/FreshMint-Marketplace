/** URL-safe collection slug helpers for /collections/<slug>. */

export const COLLECTION_SLUG_MIN = 3;
export const COLLECTION_SLUG_MAX = 48;

/** Path segments reserved under /collections/* that must not be claimed. */
export const RESERVED_COLLECTION_SLUGS = new Set([
  "new",
  "api",
  "mine",
  "create",
  "edit",
  "admin",
  "slug",
  "check",
]);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type CollectionSlugIssue =
  | "empty"
  | "too_short"
  | "too_long"
  | "invalid_format"
  | "reserved"
  | "taken";

export function normalizeCollectionSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, COLLECTION_SLUG_MAX)
    .replace(/-+$/g, "");
}

/** Softer live input cleanup — keeps a trailing hyphen while the user types. */
export function sanitizeCollectionSlugInput(raw: string): string {
  const lower = raw.toLowerCase().replace(/['’]/g, "");
  const cleaned = lower
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/g, "");
  return cleaned.slice(0, COLLECTION_SLUG_MAX);
}

export function suggestCollectionSlug(title: string): string {
  return normalizeCollectionSlug(title);
}

export function validateCollectionSlugFormat(
  raw: string,
): { ok: true; slug: string } | { ok: false; issue: CollectionSlugIssue } {
  const slug = normalizeCollectionSlug(raw);
  if (!slug) return { ok: false, issue: "empty" };
  if (slug.length < COLLECTION_SLUG_MIN) return { ok: false, issue: "too_short" };
  if (slug.length > COLLECTION_SLUG_MAX) return { ok: false, issue: "too_long" };
  if (!SLUG_RE.test(slug)) return { ok: false, issue: "invalid_format" };
  if (RESERVED_COLLECTION_SLUGS.has(slug)) return { ok: false, issue: "reserved" };
  return { ok: true, slug };
}

export function collectionSlugIssueMessage(issue: CollectionSlugIssue): string {
  switch (issue) {
    case "empty":
      return "Choose a URL slug for this collection";
    case "too_short":
      return `Slug must be at least ${COLLECTION_SLUG_MIN} characters`;
    case "too_long":
      return `Slug must be at most ${COLLECTION_SLUG_MAX} characters`;
    case "invalid_format":
      return "Use lowercase letters, numbers, and single hyphens only";
    case "reserved":
      return "That URL is reserved — pick another slug";
    case "taken":
      return "That URL is already taken";
    default:
      return "Invalid slug";
  }
}

export function collectionHref(collection: {
  id: string;
  slug?: string | null;
}): string {
  const slug = collection.slug?.trim();
  return `/collections/${slug || collection.id}`;
}
