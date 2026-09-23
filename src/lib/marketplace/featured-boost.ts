import { FEATURED_BOOST_USD } from "@/lib/fees/featured-boost";
import { prisma } from "@/lib/db";
import { toListing } from "@/lib/data/mappers";
import type { Listing } from "@/lib/discovery/types";

async function inMemoryMode(): Promise<boolean> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  return mode === "memory" || isMemoryMode();
}

/**
 * Activate a paid Featured boost on a listing the caller owns.
 * Sets featuredBoostedAt only — does not change Rising stage/score.
 */
export async function requestFeaturedBoost(input: {
  actorId: string;
  listingId: string;
}): Promise<
  | { ok: true; listing: Listing; feeUsd: number; settlement: string }
  | { ok: false; error: string }
> {
  const now = Date.now();

  if (await inMemoryMode()) {
    const { getMemoryEngine } = await import("@/lib/data/memory-store");
    const engine = getMemoryEngine();
    const listing = engine.state.listings.get(input.listingId);
    if (!listing || listing.delisted) {
      return { ok: false, error: "unavailable" };
    }
    if (listing.creatorId !== input.actorId) {
      return { ok: false, error: "forbidden" };
    }
    if (listing.stage === "draft") {
      return { ok: false, error: "publish_first" };
    }
    if (listing.featuredBoostedAt != null) {
      return { ok: false, error: "already_boosted" };
    }
    const updated: Listing = { ...listing, featuredBoostedAt: now };
    engine.state.listings.set(listing.id, updated);
    return {
      ok: true,
      listing: updated,
      feeUsd: FEATURED_BOOST_USD,
      settlement: "pay_treasury_coming_online",
    };
  }

  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
  });
  if (!listing || listing.delisted) {
    return { ok: false, error: "unavailable" };
  }
  if (listing.creatorId !== input.actorId) {
    return { ok: false, error: "forbidden" };
  }
  if (listing.stage === "draft") {
    return { ok: false, error: "publish_first" };
  }
  if (listing.featuredBoostedAt != null) {
    return { ok: false, error: "already_boosted" };
  }

  const updated = await prisma.listing.update({
    where: { id: listing.id },
    data: { featuredBoostedAt: new Date(now) },
  });

  await prisma.moderationAction.create({
    data: {
      actorId: input.actorId,
      targetType: "listing",
      targetId: listing.id,
      action: "feature",
      note: `featured_boost_request:$${FEATURED_BOOST_USD}`,
    },
  });

  return {
    ok: true,
    listing: toListing(updated),
    feeUsd: FEATURED_BOOST_USD,
    settlement: "pay_treasury_coming_online",
  };
}

/** Boosted listings for the Featured page Promoted section. */
export function selectBoostedFeatured(
  listings: Iterable<Listing>,
): Listing[] {
  return [...listings]
    .filter(
      (l) =>
        !l.delisted &&
        l.featuredBoostedAt != null &&
        l.stage !== "draft",
    )
    .sort(
      (a, b) => (b.featuredBoostedAt ?? 0) - (a.featuredBoostedAt ?? 0),
    );
}
