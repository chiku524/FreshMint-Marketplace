/** Client-safe constants + pure helpers for collections browse gates. */

/** Main /collections index requires this all-time completed volume (USD). */
export const COLLECTION_INDEX_MIN_VOLUME_USD = 1000;

/** /collections/new window. */
export const COLLECTION_NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function collectionMeetsVolumeGate(
  volumeUsd: number,
  minUsd: number = COLLECTION_INDEX_MIN_VOLUME_USD,
): boolean {
  return Number(volumeUsd) + 1e-9 >= minUsd;
}

export function isCollectionInNewWindow(
  createdAtMs: number | null | undefined,
  now = Date.now(),
  windowMs: number = COLLECTION_NEW_WINDOW_MS,
): boolean {
  if (createdAtMs == null || !Number.isFinite(createdAtMs)) return false;
  return createdAtMs <= now && now - createdAtMs <= windowMs;
}

/** Minimal anti-spam for New: at least one published (non-draft) listing. */
export function collectionHasPublishedListing(
  listings: Array<{ stage?: string | null; delisted?: boolean }>,
): boolean {
  return listings.some((l) => !l.delisted && l.stage !== "draft");
}

export function sumCompletedPurchaseVolume(
  purchases: Array<{ status?: string | null; amountUsd: number }>,
): number {
  let sum = 0;
  for (const p of purchases) {
    if ((p.status ?? "completed") !== "completed") continue;
    const n = Number(p.amountUsd);
    if (Number.isFinite(n) && n > 0) sum += n;
  }
  return Math.round(sum * 100) / 100;
}
