import type { CreatorProfile, Listing } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** ISO week key (UTC), e.g. 2026-W37. */
export function utcIsoWeekKey(ms: number): string {
  const date = new Date(ms);
  const tmp = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((tmp.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7,
  );
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Recompute daily / weekly caps from listing timestamps.
 * Stored counters are a cache; without this they never roll over.
 */
export function refreshCreatorPeriodCounters(
  creator: CreatorProfile,
  listings: Iterable<Listing>,
  now = Date.now(),
): CreatorProfile {
  const day = utcDayKey(now);
  const week = utcIsoWeekKey(now);
  let openLane = 0;
  let rising = 0;
  for (const listing of listings) {
    if (listing.creatorId !== creator.id) continue;
    if (listing.stage !== "draft") {
      const launched = listing.softLaunchedAt ?? listing.createdAt;
      if (utcDayKey(launched) === day) openLane += 1;
    }
    if (
      listing.risingEligibleAt != null &&
      utcIsoWeekKey(listing.risingEligibleAt) === week
    ) {
      rising += 1;
    }
  }
  creator.openLaneListingsToday = openLane;
  creator.risingEntriesThisWeek = rising;
  return creator;
}

export function refreshAllCreatorPeriodCounters(
  state: {
    creators: Map<string, CreatorProfile>;
    listings: Map<string, Listing>;
  },
  now = Date.now(),
): void {
  for (const creator of state.creators.values()) {
    refreshCreatorPeriodCounters(creator, state.listings.values(), now);
  }
}
