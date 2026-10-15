import { DISCOVERY_CONFIG } from "@/lib/discovery/config";
import { prisma } from "@/lib/db";
import { toListing } from "@/lib/data/mappers";
import type { Listing } from "@/lib/discovery/types";

function hourBucket(ts: number): { start: Date; end: Date } {
  const d = new Date(ts);
  d.setUTCMinutes(0, 0, 0);
  const start = d;
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start, end };
}

export interface CalendarValidation {
  ok: boolean;
  errors: string[];
}

/** One collection drop occupies one hourly slot, not one slot per piece. */
export function countHourlyDropSlots(
  rows: { id: string; collectionId?: string | null }[],
  excludeCollectionId?: string | null,
): number {
  const collections = new Set<string>();
  let standalone = 0;
  for (const row of rows) {
    if (excludeCollectionId && row.collectionId === excludeCollectionId) {
      continue;
    }
    if (row.collectionId) collections.add(row.collectionId);
    else standalone += 1;
  }
  return collections.size + standalone;
}

async function hourlyDropRefs(input: {
  type: "open_edition" | "auction";
  start: Date;
  end: Date;
}): Promise<{ id: string; collectionId?: string | null }[]> {
  const startMs = input.start.getTime();
  const endMs = input.end.getTime();
  try {
    const { ensureDatabaseReady } = await import("@/lib/db-ready");
    const { isMemoryMode, getMemoryState } = await import("@/lib/data/memory-store");
    const mode = await ensureDatabaseReady();
    if (mode === "memory" || isMemoryMode()) {
      const state = getMemoryState();
      const fromListings = [...state.listings.values()]
        .filter((listing) => {
          if (listing.delisted) return false;
          if (input.type === "open_edition") {
            return (
              listing.type === "open_edition" &&
              listing.oeStartsAt != null &&
              listing.oeStartsAt >= startMs &&
              listing.oeStartsAt < endMs
            );
          }
          return (
            listing.type === "auction" &&
            listing.auctionStartsAt != null &&
            listing.auctionStartsAt >= startMs &&
            listing.auctionStartsAt < endMs
          );
        })
        .map((listing) => ({
          id: listing.id,
          collectionId: listing.collectionId ?? null,
        }));
      if (input.type !== "open_edition") return fromListings;
      const fromCollections = [...state.collections.values()]
        .filter(
          (collection) =>
            collection.dropKind &&
            collection.dropKind !== "none" &&
            collection.dropStartsAt != null &&
            collection.dropStartsAt >= startMs &&
            collection.dropStartsAt < endMs,
        )
        .map((collection) => ({
          id: `collection:${collection.id}`,
          collectionId: collection.id,
        }));
      return [...fromListings, ...fromCollections];
    }

    const listings = await prisma.listing.findMany({
      where:
        input.type === "open_edition"
          ? {
              type: "open_edition",
              delisted: false,
              oeStartsAt: { gte: input.start, lt: input.end },
            }
          : {
              type: "auction",
              delisted: false,
              auctionStartsAt: { gte: input.start, lt: input.end },
            },
      select: { id: true, collectionId: true },
    });
    if (input.type !== "open_edition") return listings;
    const collections = await prisma.collection.findMany({
      where: {
        dropKind: { not: "none" },
        dropStartsAt: { gte: input.start, lt: input.end },
      },
      select: { id: true },
    });
    return [
      ...listings,
      ...collections.map((collection) => ({
        id: `collection:${collection.id}`,
        collectionId: collection.id,
      })),
    ];
  } catch {
    return [];
  }
}

export async function validateDropWindow(input: {
  type: "open_edition" | "auction";
  startsAt: number | null;
  endsAt: number | null;
  /** Pieces in this collection already occupy the hour — don't count them again. */
  excludeCollectionId?: string | null;
}): Promise<CalendarValidation> {
  const errors: string[] = [];
  if (input.startsAt == null || input.endsAt == null) {
    return { ok: false, errors: [`${input.type}_window_required`] };
  }
  if (input.endsAt <= input.startsAt) {
    errors.push("window_end_before_start");
  }

  const duration = input.endsAt - input.startsAt;
  if (input.type === "open_edition") {
    if (duration < DISCOVERY_CONFIG.calendar.minOeWindowMs) {
      errors.push("oe_window_too_short");
    }
    if (duration > DISCOVERY_CONFIG.calendar.maxOeWindowMs) {
      errors.push("oe_window_too_long");
    }
    if (errors.length === 0) {
      const { start, end } = hourBucket(input.startsAt);
      const slots = countHourlyDropSlots(
        await hourlyDropRefs({ type: "open_edition", start, end }),
        input.excludeCollectionId,
      );
      if (slots >= DISCOVERY_CONFIG.calendar.maxOeStartsPerHour) {
        errors.push("oe_hour_capacity_full");
      }
    }
  }

  if (input.type === "auction") {
    if (duration < DISCOVERY_CONFIG.calendar.minAuctionWindowMs) {
      errors.push("auction_window_too_short");
    }
    if (duration > DISCOVERY_CONFIG.calendar.maxAuctionWindowMs) {
      errors.push("auction_window_too_long");
    }
    if (errors.length === 0) {
      const { start, end } = hourBucket(input.startsAt);
      const slots = countHourlyDropSlots(
        await hourlyDropRefs({ type: "auction", start, end }),
        input.excludeCollectionId,
      );
      if (slots >= DISCOVERY_CONFIG.calendar.maxAuctionStartsPerHour) {
        errors.push("auction_hour_capacity_full");
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export interface CalendarEvent {
  listing: Listing;
  kind: "open_edition" | "auction";
  startsAt: number;
  endsAt: number;
  status: "upcoming" | "live" | "ended";
}

export async function getDropCalendar(now = Date.now()): Promise<{
  openEditions: CalendarEvent[];
  auctions: CalendarEvent[];
  risingOeLiveCount: number;
  liveAuctionStripCount: number;
  caps: {
    maxConcurrentOeOnRising: number;
    liveAuctionStripSlots: number;
    maxOeStartsPerHour: number;
    maxAuctionStartsPerHour: number;
  };
}> {
  const emptyCaps = {
    maxConcurrentOeOnRising: DISCOVERY_CONFIG.maxConcurrentOeOnRising,
    liveAuctionStripSlots: DISCOVERY_CONFIG.liveAuctionStripSlots,
    maxOeStartsPerHour: DISCOVERY_CONFIG.calendar.maxOeStartsPerHour,
    maxAuctionStartsPerHour: DISCOVERY_CONFIG.calendar.maxAuctionStartsPerHour,
  };

  let listings;
  try {
    const { ensureDatabaseReady } = await import("@/lib/db-ready");
    const mode = await ensureDatabaseReady();
    if (mode === "memory") {
      const { getMemoryState } = await import("@/lib/data/memory-store");
      const state = getMemoryState();
      listings = [...state.listings.values()]
        .filter(
          (l) =>
            !l.delisted &&
            ((l.type === "open_edition" && l.oeStartsAt != null) ||
              (l.type === "auction" && l.auctionStartsAt != null)),
        )
        .map((l) => ({
          ...l,
          // Shape enough for toListing passthrough below via synthetic rows
        }));
      // Build calendar from memory listings directly
      const openEditions: CalendarEvent[] = [];
      const auctions: CalendarEvent[] = [];
      for (const listing of state.listings.values()) {
        if (listing.delisted) continue;
        if (
          listing.type === "open_edition" &&
          listing.oeStartsAt &&
          listing.oeEndsAt
        ) {
          const status =
            now < listing.oeStartsAt
              ? "upcoming"
              : now > listing.oeEndsAt
                ? "ended"
                : "live";
          openEditions.push({
            listing,
            kind: "open_edition",
            startsAt: listing.oeStartsAt,
            endsAt: listing.oeEndsAt,
            status,
          });
        }
        if (
          listing.type === "auction" &&
          listing.auctionStartsAt &&
          listing.auctionEndsAt
        ) {
          const status =
            now < listing.auctionStartsAt
              ? "upcoming"
              : now > listing.auctionEndsAt
                ? "ended"
                : "live";
          auctions.push({
            listing,
            kind: "auction",
            startsAt: listing.auctionStartsAt,
            endsAt: listing.auctionEndsAt,
            status,
          });
        }
      }
      openEditions.sort((a, b) => a.startsAt - b.startsAt);
      auctions.sort((a, b) => a.startsAt - b.startsAt);
      return {
        openEditions,
        auctions,
        risingOeLiveCount: openEditions.filter(
          (e) =>
            e.status === "live" &&
            (e.listing.stage === "rising_eligible" ||
              e.listing.stage === "featured_eligible" ||
              e.listing.stage === "featured"),
        ).length,
        liveAuctionStripCount: auctions.filter((e) => e.status === "live")
          .length,
        caps: emptyCaps,
      };
    }

    listings = await prisma.listing.findMany({
      where: {
        delisted: false,
        OR: [
          { type: "open_edition", oeStartsAt: { not: null } },
          { type: "auction", auctionStartsAt: { not: null } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  } catch {
    return {
      openEditions: [],
      auctions: [],
      risingOeLiveCount: 0,
      liveAuctionStripCount: 0,
      caps: emptyCaps,
    };
  }

  const openEditions: CalendarEvent[] = [];
  const auctions: CalendarEvent[] = [];

  for (const row of listings) {
    const listing = toListing(row);
    if (listing.type === "open_edition" && listing.oeStartsAt && listing.oeEndsAt) {
      const status =
        now < listing.oeStartsAt
          ? "upcoming"
          : now > listing.oeEndsAt
            ? "ended"
            : "live";
      openEditions.push({
        listing,
        kind: "open_edition",
        startsAt: listing.oeStartsAt,
        endsAt: listing.oeEndsAt,
        status,
      });
    }
    if (listing.type === "auction" && listing.auctionStartsAt && listing.auctionEndsAt) {
      const status =
        now < listing.auctionStartsAt
          ? "upcoming"
          : now > listing.auctionEndsAt
            ? "ended"
            : "live";
      auctions.push({
        listing,
        kind: "auction",
        startsAt: listing.auctionStartsAt,
        endsAt: listing.auctionEndsAt,
        status,
      });
    }
  }

  openEditions.sort((a, b) => a.startsAt - b.startsAt);
  auctions.sort((a, b) => a.startsAt - b.startsAt);

  const risingOeLiveCount = openEditions.filter(
    (e) =>
      e.status === "live" &&
      (e.listing.stage === "rising_eligible" ||
        e.listing.stage === "featured_eligible" ||
        e.listing.stage === "featured"),
  ).length;

  const liveAuctionStripCount = auctions.filter((e) => e.status === "live").length;

  return {
    openEditions,
    auctions,
    risingOeLiveCount,
    liveAuctionStripCount,
    caps: {
      maxConcurrentOeOnRising: DISCOVERY_CONFIG.maxConcurrentOeOnRising,
      liveAuctionStripSlots: DISCOVERY_CONFIG.liveAuctionStripSlots,
      maxOeStartsPerHour: DISCOVERY_CONFIG.calendar.maxOeStartsPerHour,
      maxAuctionStartsPerHour: DISCOVERY_CONFIG.calendar.maxAuctionStartsPerHour,
    },
  };
}
