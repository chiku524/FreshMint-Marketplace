/** Global collection display-name helpers (case-insensitive uniqueness). */

export const COLLECTION_TITLE_MIN = 1;
export const COLLECTION_TITLE_MAX = 120;

export type CollectionTitleIssue = "empty" | "too_long" | "taken";

/**
 * Canonical form used for uniqueness across all networks.
 * Policy: case-insensitive; trim ends; collapse internal whitespace.
 * Display `title` keeps the creator's casing; only this form is unique.
 */
export function normalizeCollectionTitle(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

export function validateCollectionTitleFormat(
  raw: string,
): { ok: true; title: string; normalized: string } | { ok: false; issue: CollectionTitleIssue } {
  const title = raw.trim().replace(/\s+/g, " ");
  if (!title || title.length < COLLECTION_TITLE_MIN) {
    return { ok: false, issue: "empty" };
  }
  if (title.length > COLLECTION_TITLE_MAX) {
    return { ok: false, issue: "too_long" };
  }
  return { ok: true, title, normalized: normalizeCollectionTitle(title) };
}

export function collectionTitleIssueMessage(issue: CollectionTitleIssue): string {
  switch (issue) {
    case "empty":
      return "Choose a name for this collection";
    case "too_long":
      return `Name must be at most ${COLLECTION_TITLE_MAX} characters`;
    case "taken":
      return "That collection name is already taken";
    default:
      return "Invalid collection name";
  }
}
