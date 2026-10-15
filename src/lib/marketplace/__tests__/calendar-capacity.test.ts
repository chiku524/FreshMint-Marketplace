import { beforeEach, describe, expect, it } from "vitest";
import {
  enableMemoryMode,
  getMemoryState,
  resetMemoryStoreForTests,
} from "@/lib/data/memory-store";
import { DISCOVERY_CONFIG } from "@/lib/discovery/config";
import type { Listing } from "@/lib/discovery/types";
import {
  countHourlyDropSlots,
  validateDropWindow,
} from "@/lib/marketplace/calendar";
import {
  createCollectionForUser,
  createListingForUser,
  updateCollectionDrop,
} from "@/lib/marketplace/service";

beforeEach(() => {
  resetMemoryStoreForTests();
  enableMemoryMode("unit-test");
});

function windowInCurrentHour() {
  const hour = new Date();
  hour.setUTCMinutes(10, 0, 0);
  const startsAt = hour.getTime();
  const endsAt = startsAt + DISCOVERY_CONFIG.calendar.minOeWindowMs;
  return {
    startsAt,
    endsAt,
    startIso: new Date(startsAt).toISOString(),
    endIso: new Date(endsAt).toISOString(),
  };
}

function plantOe(input: {
  id: string;
  startsAt: number;
  collectionId?: string | null;
}) {
  const seed = getMemoryState().listings.get("listing-glitch-oe");
  if (!seed) throw new Error("missing seed listing-glitch-oe");
  const listing: Listing = {
    ...seed,
    id: input.id,
    collectionId: input.collectionId ?? null,
    oeStartsAt: input.startsAt,
    oeEndsAt: input.startsAt + DISCOVERY_CONFIG.calendar.minOeWindowMs,
    mediaHash: `hash-${input.id}`,
  };
  getMemoryState().listings.set(listing.id, listing);
}

describe("countHourlyDropSlots", () => {
  it("counts a collection once even with many pieces", () => {
    expect(
      countHourlyDropSlots([
        { id: "a", collectionId: "afterhours" },
        { id: "b", collectionId: "afterhours" },
        { id: "c", collectionId: "afterhours" },
      ]),
    ).toBe(1);
  });

  it("skips the collection being filled", () => {
    expect(
      countHourlyDropSlots(
        [
          { id: "a", collectionId: "afterhours" },
          { id: "solo", collectionId: null },
        ],
        "afterhours",
      ),
    ).toBe(1);
  });
});

describe("collection drop hourly capacity", () => {
  it("lets one collection mint many OE pieces in the same hour", async () => {
    const collection = await createCollectionForUser({
      creatorId: "artist-fresh",
      title: "Afterhours Cap",
      slug: "afterhours-cap",
      network: "boing",
    });
    expect(collection.ok).toBe(true);
    if (!collection.ok) return;
    const { startIso, endIso, startsAt, endsAt } = windowInCurrentHour();

    const scheduled = await updateCollectionDrop({
      collectionId: collection.collection.id,
      creatorId: "artist-fresh",
      dropKind: "open",
      dropStartsAt: startIso,
      dropEndsAt: endIso,
      dropPriceUsd: 8,
    });
    expect(scheduled.ok).toBe(true);

    const overCap = DISCOVERY_CONFIG.calendar.maxOeStartsPerHour + 4;
    for (let i = 0; i < overCap; i++) {
      const piece = await createListingForUser({
        creatorId: "artist-fresh",
        title: `Afterhours ${i + 1}`,
        description: "batch piece",
        type: "open_edition",
        network: "boing",
        priceUsd: 8,
        medium: "digital",
        styleTags: [],
        mediaContent: `afterhours-piece-${i}-${crypto.randomUUID()}`,
        collectionId: collection.collection.id,
        oeStartsAt: startIso,
        oeEndsAt: endIso,
      });
      expect(piece.ok, `piece ${i + 1}`).toBe(true);
    }

    const planted = DISCOVERY_CONFIG.calendar.maxOeStartsPerHour + 6;
    for (let i = 0; i < planted; i++) {
      plantOe({
        id: `afterhours-plant-${i}`,
        startsAt,
        collectionId: collection.collection.id,
      });
    }
    const sameCollection = await validateDropWindow({
      type: "open_edition",
      startsAt,
      endsAt,
      excludeCollectionId: collection.collection.id,
    });
    expect(sameCollection.ok).toBe(true);

    const again = await updateCollectionDrop({
      collectionId: collection.collection.id,
      creatorId: "artist-fresh",
      dropKind: "open",
      dropStartsAt: new Date(startsAt).toISOString(),
      dropEndsAt: new Date(endsAt).toISOString(),
      dropPriceUsd: 8,
    });
    expect(again.ok).toBe(true);
  });

  it("still blocks unrelated standalone drops once the hour is full", async () => {
    const { startsAt, endsAt } = windowInCurrentHour();
    const cap = DISCOVERY_CONFIG.calendar.maxOeStartsPerHour;
    for (let i = 0; i < cap; i++) {
      plantOe({ id: `solo-oe-${i}`, startsAt });
    }
    const blocked = await validateDropWindow({
      type: "open_edition",
      startsAt,
      endsAt,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.errors).toContain("oe_hour_capacity_full");
  });
});
