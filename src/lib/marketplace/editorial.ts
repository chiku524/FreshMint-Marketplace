import { DISCOVERY_CONFIG } from "@/lib/discovery/config";
import { prisma } from "@/lib/db";
import { toListing } from "@/lib/data/mappers";
import { transitionListingStage } from "./service";

async function inMemoryMode(): Promise<boolean> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  return mode === "memory" || isMemoryMode();
}

export async function featureListing(input: {
  actorId: string;
  listingId: string;
}) {
  if (await inMemoryMode()) {
    const { getMemoryEngine } = await import("@/lib/data/memory-store");
    const engine = getMemoryEngine();
    const listing = engine.state.listings.get(input.listingId);
    if (!listing || listing.delisted) {
      return { ok: false as const, error: "unavailable" };
    }
    const featuredCount = [...engine.state.listings.values()].filter(
      (l) => l.stage === "featured" && !l.delisted,
    ).length;
    if (featuredCount >= DISCOVERY_CONFIG.featuredSlotsPerDay) {
      return { ok: false as const, error: "featured_slots_full" };
    }
    if (listing.stage === "soft_launch") {
      return { ok: false as const, error: "must_reach_rising_first" };
    }
    const now = Date.now();
    const updated = {
      ...listing,
      stage: "featured" as const,
      featuredAt: now,
      risingEligibleAt: listing.risingEligibleAt ?? now,
    };
    engine.state.listings.set(listing.id, updated);
    return { ok: true as const, listing: updated };
  }

  const featuredCount = await prisma.listing.count({
    where: { stage: "featured", delisted: false },
  });
  if (featuredCount >= DISCOVERY_CONFIG.featuredSlotsPerDay) {
    return { ok: false as const, error: "featured_slots_full" };
  }

  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
  });
  if (!listing || listing.delisted) {
    return { ok: false as const, error: "unavailable" };
  }

  if (listing.stage === "rising_eligible") {
    const toEligible = await transitionListingStage(
      listing.id,
      "featured_eligible",
    );
    if (!toEligible.ok) {
      await prisma.listing.update({
        where: { id: listing.id },
        data: { nominationScore: { increment: 2 } },
      });
      const retry = await transitionListingStage(listing.id, "featured_eligible");
      if (!retry.ok) return { ok: false as const, error: retry.errors.join(",") };
    }
  }

  const current = await prisma.listing.findUniqueOrThrow({
    where: { id: input.listingId },
  });
  if (current.stage === "featured_eligible" || current.stage === "featured") {
    if (current.stage !== "featured") {
      const featured = await transitionListingStage(current.id, "featured");
      if (!featured.ok) {
        await prisma.listing.update({
          where: { id: current.id },
          data: { stage: "featured", featuredAt: new Date() },
        });
      }
    }
  } else if (current.stage === "soft_launch") {
    return { ok: false as const, error: "must_reach_rising_first" };
  } else {
    await prisma.listing.update({
      where: { id: current.id },
      data: { stage: "featured", featuredAt: new Date() },
    });
  }

  await prisma.moderationAction.create({
    data: {
      actorId: input.actorId,
      targetType: "listing",
      targetId: input.listingId,
      action: "feature",
      note: "editorial_feature",
    },
  });

  const updated = await prisma.listing.findUniqueOrThrow({
    where: { id: input.listingId },
  });
  return { ok: true as const, listing: toListing(updated) };
}

export async function unfeatureListing(input: {
  actorId: string;
  listingId: string;
}) {
  if (await inMemoryMode()) {
    const { getMemoryEngine } = await import("@/lib/data/memory-store");
    const engine = getMemoryEngine();
    const listing = engine.state.listings.get(input.listingId);
    if (!listing) return { ok: false as const, error: "not_found" };
    engine.state.listings.set(listing.id, {
      ...listing,
      stage: "rising_eligible",
      featuredAt: null,
    });
    return { ok: true as const };
  }

  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
  });
  if (!listing) return { ok: false as const, error: "not_found" };

  await prisma.listing.update({
    where: { id: listing.id },
    data: {
      stage: "rising_eligible",
      featuredAt: null,
    },
  });
  await prisma.moderationAction.create({
    data: {
      actorId: input.actorId,
      targetType: "listing",
      targetId: listing.id,
      action: "unfeature",
    },
  });
  return { ok: true as const };
}

export async function createShelf(input: {
  curatorId: string;
  name: string;
  listingIds: string[];
}) {
  if (!input.name.trim()) {
    return { ok: false as const, error: "name_required" };
  }

  if (await inMemoryMode()) {
    const { getMemoryEngine } = await import("@/lib/data/memory-store");
    const engine = getMemoryEngine();
    const id = `shelf-mem-${Date.now()}`;
    const shelf = {
      id,
      name: input.name.trim(),
      curatorId: input.curatorId,
      listingIds: input.listingIds.filter((lid) =>
        engine.state.listings.has(lid),
      ),
      followerIds: [input.curatorId],
    };
    engine.state.shelves.set(id, shelf);

    const follows = engine.state.follows.get(input.curatorId) ?? {
      collectorId: input.curatorId,
      followedArtistIds: [],
      followedCollectorIds: [],
      followedShelfIds: [],
    };
    if (!follows.followedShelfIds.includes(id)) {
      follows.followedShelfIds = [...follows.followedShelfIds, id];
    }
    engine.state.follows.set(input.curatorId, follows);

    return { ok: true as const, shelf };
  }

  const shelf = await prisma.shelf.create({
    data: {
      name: input.name.trim(),
      curatorId: input.curatorId,
      items: {
        create: input.listingIds.map((listingId, position) => ({
          listingId,
          position,
        })),
      },
      followers: {
        create: [{ followerId: input.curatorId }],
      },
    },
    include: { items: true, followers: true },
  });
  return {
    ok: true as const,
    shelf: {
      id: shelf.id,
      name: shelf.name,
      curatorId: shelf.curatorId,
      listingIds: shelf.items.map((i) => i.listingId),
      followerIds: shelf.followers.map((f) => f.followerId),
    },
  };
}

export async function addListingToShelf(input: {
  shelfId: string;
  curatorId: string;
  listingId: string;
}) {
  if (await inMemoryMode()) {
    const { getMemoryEngine } = await import("@/lib/data/memory-store");
    const engine = getMemoryEngine();
    const shelf = engine.state.shelves.get(input.shelfId);
    if (!shelf) return { ok: false as const, error: "not_found" };
    if (shelf.curatorId !== input.curatorId) {
      return { ok: false as const, error: "forbidden" };
    }
    if (!engine.state.listings.has(input.listingId)) {
      return { ok: false as const, error: "listing_missing" };
    }
    if (!shelf.listingIds.includes(input.listingId)) {
      shelf.listingIds = [...shelf.listingIds, input.listingId];
      engine.state.shelves.set(shelf.id, shelf);
    }
    return { ok: true as const };
  }

  const shelf = await prisma.shelf.findUnique({ where: { id: input.shelfId } });
  if (!shelf) return { ok: false as const, error: "not_found" };
  if (shelf.curatorId !== input.curatorId) {
    return { ok: false as const, error: "forbidden" };
  }
  await prisma.shelfItem.upsert({
    where: {
      shelfId_listingId: {
        shelfId: input.shelfId,
        listingId: input.listingId,
      },
    },
    create: {
      shelfId: input.shelfId,
      listingId: input.listingId,
      position: 0,
    },
    update: {},
  });
  return { ok: true as const };
}
