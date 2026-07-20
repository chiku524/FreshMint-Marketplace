import { getDiscoveryEngine } from "@/lib/marketplace/service";
import type { Listing } from "@/lib/discovery/types";

export type FeaturedOfTheWeek = {
  listing: Listing;
  creatorName: string;
  weekLabel: string;
  weekKey: string;
};

/** ISO week key (UTC) — stable pick for the calendar week. */
export function isoWeekKey(now = Date.now()): string {
  const date = new Date(now);
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function weekLabelFromKey(weekKey: string): string {
  const [year, week] = weekKey.split("-W");
  return `Week ${Number(week)}, ${year}`;
}

function pickStableIndex(weekKey: string, length: number): number {
  if (length <= 0) return 0;
  let h = 2166136261;
  for (let i = 0; i < weekKey.length; i++) {
    h ^= weekKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % length;
}

/**
 * One featured spotlight for the current week, chosen stably from the
 * featured / featured_eligible pool so it doesn't flicker between loads.
 */
export async function getFeaturedOfTheWeek(
  now = Date.now(),
): Promise<FeaturedOfTheWeek | null> {
  const engine = await getDiscoveryEngine();
  const pool = engine.buildFeatured(undefined, now);
  if (pool.length === 0) return null;

  const featuredOnly = pool.filter((p) => p.listing.stage === "featured");
  const candidates = featuredOnly.length > 0 ? featuredOnly : pool;
  const weekKey = isoWeekKey(now);
  const picked = candidates[pickStableIndex(weekKey, candidates.length)]!;
  const creator = engine.state.creators.get(picked.listing.creatorId);

  return {
    listing: picked.listing,
    creatorName: creator?.displayName ?? "Artist",
    weekLabel: weekLabelFromKey(weekKey),
    weekKey,
  };
}
