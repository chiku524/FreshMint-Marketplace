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
  return creatorsBrowseHref({ sort, page: 1 });
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

export const CREATOR_BROWSE_PAGE_SIZE = 24;

export function parseCreatorsPage(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export function creatorsBrowseHref(input: {
  sort: CreatorsSortId;
  page?: number;
}): string {
  const sp = new URLSearchParams();
  if (input.sort !== "top") sp.set("sort", input.sort);
  const page = input.page ?? 1;
  if (page > 1) sp.set("page", String(page));
  const q = sp.toString();
  return q ? `/creators?${q}` : "/creators";
}

export type PageSlice<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  hasPrev: boolean;
  hasNext: boolean;
};

/** 1-based page clamp. Empty lists yield page=1, pageCount=1. */
export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number = CREATOR_BROWSE_PAGE_SIZE,
): PageSlice<T> {
  const size = Math.max(1, Math.floor(pageSize) || CREATOR_BROWSE_PAGE_SIZE);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size) || 1);
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (safePage - 1) * size;
  return {
    items: items.slice(start, start + size),
    page: safePage,
    pageSize: size,
    total,
    pageCount,
    hasPrev: safePage > 1,
    hasNext: safePage < pageCount,
  };
}
