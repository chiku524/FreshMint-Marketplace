import { describe, expect, it } from "vitest";
import {
  computeCollectionRarity,
  formatTraitPercent,
  rarityRankLabel,
} from "@/lib/marketplace/rarity";

describe("computeCollectionRarity", () => {
  it("returns hasTraits false and no ranks when nothing has traits", () => {
    const result = computeCollectionRarity([
      { id: "a", traits: [] },
      { id: "b", traits: undefined },
    ]);
    expect(result.hasTraits).toBe(false);
    expect(result.scoredSize).toBe(0);
    expect(result.byListingId.get("a")?.rank).toBeNull();
    expect(result.byListingId.get("b")?.rank).toBeNull();
  });

  it("ranks by inverse trait frequency (rarer value wins)", () => {
    const result = computeCollectionRarity([
      {
        id: "common",
        traits: [
          { trait_type: "Background", value: "Blue" },
          { trait_type: "Eyes", value: "Normal" },
        ],
      },
      {
        id: "rare",
        traits: [
          { trait_type: "Background", value: "Gold" },
          { trait_type: "Eyes", value: "Normal" },
        ],
      },
      {
        id: "mid",
        traits: [
          { trait_type: "Background", value: "Blue" },
          { trait_type: "Eyes", value: "Laser" },
        ],
      },
      { id: "blank", traits: [] },
    ]);

    expect(result.hasTraits).toBe(true);
    expect(result.collectionSize).toBe(4);
    expect(result.scoredSize).toBe(3);

    const rare = result.byListingId.get("rare")!;
    const mid = result.byListingId.get("mid")!;
    const common = result.byListingId.get("common")!;
    const blank = result.byListingId.get("blank")!;

    // Gold appears once → 4/1 = 4; Normal twice → 4/2 = 2; score 6
    expect(rare.score).toBe(6);
    // Blue twice → 2; Laser once → 4; score 6 — tie with rare; id asc
    expect(mid.score).toBe(6);
    // Blue 2 + Normal 2 = 4
    expect(common.score).toBe(4);

    expect(mid.rank).toBe(1); // "mid" before "rare" on equal score
    expect(rare.rank).toBe(2);
    expect(common.rank).toBe(3);
    expect(blank.rank).toBeNull();
    expect(blank.traits).toEqual([]);
  });

  it("exposes per-trait frequency against full collection size", () => {
    const result = computeCollectionRarity([
      { id: "1", traits: [{ trait_type: "Fur", value: "Gold" }] },
      { id: "2", traits: [{ trait_type: "Fur", value: "Brown" }] },
      { id: "3", traits: [{ trait_type: "Fur", value: "Brown" }] },
      { id: "4", traits: [] },
    ]);
    const gold = result.byListingId.get("1")!.traits[0];
    expect(gold.count).toBe(1);
    expect(gold.frequency).toBe(0.25);
    expect(gold.score).toBe(4);
    expect(formatTraitPercent(gold.frequency)).toBe("25%");
  });

  it("dedupes duplicate trait values on one listing", () => {
    const result = computeCollectionRarity([
      {
        id: "dup",
        traits: [
          { trait_type: "Hat", value: "Crown" },
          { trait_type: "Hat", value: "Crown" },
        ],
      },
      { id: "other", traits: [{ trait_type: "Hat", value: "Cap" }] },
    ]);
    const row = result.byListingId.get("dup")!;
    expect(row.traits).toHaveLength(1);
    expect(row.traits[0].count).toBe(1);
  });
});

describe("rarityRankLabel", () => {
  it("formats ranked labels and hides unranked", () => {
    expect(
      rarityRankLabel({
        listingId: "x",
        score: 3,
        rank: 2,
        scoredSize: 10,
        collectionSize: 12,
        traits: [],
      }),
    ).toBe("#2");
    expect(
      rarityRankLabel({
        listingId: "x",
        score: 0,
        rank: null,
        scoredSize: 10,
        collectionSize: 12,
        traits: [],
      }),
    ).toBeNull();
  });
});
