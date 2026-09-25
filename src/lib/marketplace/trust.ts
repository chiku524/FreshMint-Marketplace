/** Creator trust / quality gates (documented constants). */

/** "Active seller" badge: all-time completed primary volume. */
export const ACTIVE_SELLER_MIN_VOLUME_USD = 100;

/** New / low-trust accounts: max soft-launches per rolling day. */
export const NEW_CREATOR_DAILY_PUBLISH_LIMIT = 3;

/** Curator score below this is treated as low-trust for publish rate limits. */
export const LOW_TRUST_CURATOR_SCORE = 25;

/** Account age (ms) under which the daily publish limit applies. */
export const NEW_ACCOUNT_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Secondary / resale: default creator royalty (5%). Platform fee still 0.5%. */
export const DEFAULT_CREATOR_RESALE_ROYALTY_BPS = 500;

export function isActiveSeller(volumeUsdAllTime: number): boolean {
  return Number(volumeUsdAllTime) + 1e-9 >= ACTIVE_SELLER_MIN_VOLUME_USD;
}

export function shouldRateLimitPublishes(input: {
  curatorScore: number;
  walletCreatedAtMs: number;
  now?: number;
}): boolean {
  const now = input.now ?? Date.now();
  if (input.curatorScore < LOW_TRUST_CURATOR_SCORE) return true;
  if (now - input.walletCreatedAtMs < NEW_ACCOUNT_AGE_MS) return true;
  return false;
}
