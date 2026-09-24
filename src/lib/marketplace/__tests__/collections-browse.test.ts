import { describe, expect, it } from "vitest";
import {
  COLLECTION_INDEX_MIN_VOLUME_USD,
  COLLECTION_NEW_WINDOW_MS,
  collectionHasPublishedListing,
  collectionMeetsVolumeGate,
  filterPublicCollectionApiList,
  isCollectionInNewWindow,
  sumCompletedPurchaseVolume,
} from "@/lib/marketplace/collections-browse";
import type { Collection } from "@/lib/discovery/types";

describe("collection volume gate", () => {
  it("exposes the $1000 index threshold", () => {
    expect(COLLECTION_INDEX_MIN_VOLUME_USD).toBe(1000);
  });

  it("sums only completed purchase USD (pending/failed excluded)", () => {
    expect(
      sumCompletedPurchaseVolume([
        { status: "completed", amountUsd: 400 },
        { status: "pending_payment", amountUsd: 900 },
        { status: "failed", amountUsd: 200 },
        { status: "completed", amountUsd: 600.5 },
      ]),
    ).toBe(1000.5);
  });

  it("treats missing status as completed for legacy rows", () => {
    expect(sumCompletedPurchaseVolume([{ amountUsd: 1000 }])).toBe(1000);
  });

  it("includes package legs when they are completed purchases", () => {
    // Package prepare splits into N purchase rows — index volume is their sum.
    const packageLegs = [
      { status: "completed", amountUsd: 250 },
      { status: "completed", amountUsd: 250 },
      { status: "completed", amountUsd: 500 },
    ];
    expect(sumCompletedPurchaseVolume(packageLegs)).toBe(1000);
    expect(collectionMeetsVolumeGate(1000)).toBe(true);
    expect(collectionMeetsVolumeGate(999.99)).toBe(false);
  });

  it("filters public API collections by volume map", () => {
    const collections = [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
    ] as Collection[];
    const volumes = new Map([
      ["a", 1500],
      ["b", 50],
    ]);
    const filtered = filterPublicCollectionApiList(collections, volumes);
    expect(filtered.map((c) => c.id)).toEqual(["a"]);
  });
});

describe("new collections window", () => {
  const now = 1_700_000_000_000;

  it("uses a 7-day window", () => {
    expect(COLLECTION_NEW_WINDOW_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("includes collections created within the window, newest boundary inclusive", () => {
    expect(isCollectionInNewWindow(now, now)).toBe(true);
    expect(isCollectionInNewWindow(now - COLLECTION_NEW_WINDOW_MS, now)).toBe(
      true,
    );
    expect(
      isCollectionInNewWindow(now - COLLECTION_NEW_WINDOW_MS - 1, now),
    ).toBe(false);
    expect(isCollectionInNewWindow(null, now)).toBe(false);
  });

  it("requires at least one published non-draft listing", () => {
    expect(
      collectionHasPublishedListing([
        { stage: "draft", delisted: false },
        { stage: "soft_launch", delisted: true },
      ]),
    ).toBe(false);
    expect(
      collectionHasPublishedListing([
        { stage: "draft", delisted: false },
        { stage: "soft_launch", delisted: false },
      ]),
    ).toBe(true);
  });
});
