import { describe, expect, it } from "vitest";
import {
  CREATOR_INDEX_MIN_PUBLISHED_WORKS,
  CREATOR_TOP_MIN_VOLUME_USD_7D,
  creatorHasPublishedWorks,
  creatorMeetsTopVolumeGate,
  isCreatorInNewWindow,
  parseCreatorsSort,
  creatorsSortHref,
  CREATOR_NEW_WINDOW_MS,
} from "@/lib/marketplace/creators-browse-config";
import {
  creatorsSubtitleMode,
  fillCreatorDiscovery,
  sortCreatorBrowseRows,
  type CreatorBrowseRow,
} from "@/lib/marketplace/creators-browse";

function row(partial: Partial<CreatorBrowseRow> & { id: string }): CreatorBrowseRow {
  return {
    displayName: partial.id,
    volumeUsd7d: 0,
    volumeUsdAllTime: 0,
    publishedWorks: 1,
    collectionCount: 0,
    completedSales: 0,
    firstListingAt: null,
    emerging: false,
    verifiedCreator: false,
    establishedBadge: false,
    ...partial,
  };
}

describe("creator spam / gates", () => {
  it("documents early-stage Top bar: any positive 7d volume", () => {
    expect(CREATOR_TOP_MIN_VOLUME_USD_7D).toBe(0);
    expect(creatorMeetsTopVolumeGate(0)).toBe(false);
    expect(creatorMeetsTopVolumeGate(0.01)).toBe(true);
    expect(CREATOR_INDEX_MIN_PUBLISHED_WORKS).toBe(1);
    expect(creatorHasPublishedWorks(0)).toBe(false);
    expect(creatorHasPublishedWorks(1)).toBe(true);
  });
});

describe("parseCreatorsSort", () => {
  it("defaults to top and accepts aliases", () => {
    expect(parseCreatorsSort(undefined)).toBe("top");
    expect(parseCreatorsSort("new")).toBe("new");
    expect(parseCreatorsSort("all_time")).toBe("all_time");
    expect(parseCreatorsSort("alltime")).toBe("all_time");
    expect(creatorsSortHref("top")).toBe("/creators");
    expect(creatorsSortHref("new")).toBe("/creators?sort=new");
  });
});

describe("fillCreatorDiscovery fallbacks", () => {
  it("prefers 7d volume then most active then newest", () => {
    const filled = fillCreatorDiscovery({
      trending7d: [{ id: "t1", volumeUsd: 40 }],
      mostActiveIds: ["t1", "a1", "a2"],
      newestIds: ["n1", "a1"],
      limit: 3,
    });
    expect(filled.map((f) => [f.id, f.source])).toEqual([
      ["t1", "trending_7d"],
      ["a1", "most_active"],
      ["a2", "most_active"],
    ]);
    expect(creatorsSubtitleMode(filled.map((f) => f.source))).toBe("mixed");
  });

  it("excludes zero-volume from trending and labels most_active honestly", () => {
    const filled = fillCreatorDiscovery({
      trending7d: [{ id: "z", volumeUsd: 0 }],
      mostActiveIds: ["a1"],
      newestIds: [],
      limit: 2,
    });
    expect(filled.map((f) => f.source)).toEqual(["most_active"]);
    expect(creatorsSubtitleMode(filled.map((f) => f.source))).toBe(
      "most_active",
    );
  });
});

describe("sortCreatorBrowseRows", () => {
  const now = 1_700_000_000_000;
  const rows = [
    row({ id: "hot", volumeUsd7d: 100, volumeUsdAllTime: 100, publishedWorks: 2 }),
    row({
      id: "newish",
      volumeUsd7d: 0,
      volumeUsdAllTime: 5,
      firstListingAt: now - 1000,
      publishedWorks: 1,
    }),
    row({
      id: "old",
      volumeUsd7d: 0,
      volumeUsdAllTime: 500,
      completedSales: 3,
      firstListingAt: now - CREATOR_NEW_WINDOW_MS - 10,
      publishedWorks: 4,
    }),
  ];

  it("Top only includes positive 7d volume", () => {
    expect(sortCreatorBrowseRows(rows, "top", now).map((r) => r.id)).toEqual([
      "hot",
    ]);
  });

  it("New uses firstListingAt window", () => {
    expect(isCreatorInNewWindow(now - 1000, now)).toBe(true);
    expect(
      sortCreatorBrowseRows(rows, "new", now).map((r) => r.id),
    ).toEqual(["newish"]);
  });

  it("All-time ranks by volume", () => {
    expect(
      sortCreatorBrowseRows(rows, "all_time", now).map((r) => r.id),
    ).toEqual(["old", "hot", "newish"]);
  });
});
