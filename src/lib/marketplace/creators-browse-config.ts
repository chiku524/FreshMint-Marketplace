/** Client-safe constants + pure helpers for creators discovery. */

/** Top / Trending (7d): volume must exceed this (early-stage: any completed sale). */
export const CREATOR_TOP_MIN_VOLUME_USD_7D = 0;

/** Index / New / Most-active presence: at least this many published non-draft works. */
export const CREATOR_INDEX_MIN_PUBLISHED_WORKS = 1;

/** New creators window (first public listing). */
export const CREATOR_NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const CREATOR_HOME_LIMIT = 8;

export type CreatorsSortId = "top" | "new" | "all_time";

export function parseCreatorsSort(value: unknown): CreatorsSortId {
  if (value === "new" || value === "all_time" || value === "top") return value;
  if (value === "alltime" || value === "volume") return "all_time";
  return "top";
}

export function creatorsSortHref(sort: CreatorsSortId): string {
  if (sort === "top") return "/creators";
  return `/creators?sort=${sort}`;
}

export function creatorMeetsTopVolumeGate(
  volumeUsd7d: number,
  minUsd: number = CREATOR_TOP_MIN_VOLUME_USD_7D,
): boolean {
  // Strictly greater than min — with min=0 this means ≥1 completed sale (positive USD).
  return Number(volumeUsd7d) > minUsd + 1e-9;
}

export function creatorHasPublishedWorks(
  publishedCount: number,
  min: number = CREATOR_INDEX_MIN_PUBLISHED_WORKS,
): boolean {
  return publishedCount >= min;
}

export function isCreatorInNewWindow(
  firstListingAtMs: number | null | undefined,
  now = Date.now(),
  windowMs: number = CREATOR_NEW_WINDOW_MS,
): boolean {
  if (firstListingAtMs == null || !Number.isFinite(firstListingAtMs)) return false;
  return firstListingAtMs <= now && now - firstListingAtMs <= windowMs;
}
