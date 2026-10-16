import { describe, expect, it } from "vitest";
import { orderCollectionPieces, parseCollectionSort } from "./rarity-order";

const p = (id: string, createdAt: number) => ({ id, createdAt });

describe("orderCollectionPieces", () => {
  it("sorts all items by rarity rank, unranked last, ties newest first", () => {
    const pieces = [p("a", 1), p("b", 2), p("c", 3), p("d", 4)];
    const ranks = new Map([["c", { rank: 1 }], ["a", { rank: 2 }]]);
    expect(orderCollectionPieces(pieces, ranks, "rarity").map((x) => x.id)).toEqual(["c", "a", "d", "b"]);
    expect(orderCollectionPieces(pieces, ranks, "newest").map((x) => x.id)).toEqual(["d", "c", "b", "a"]);
  });
  it("parses sort param", () => {
    expect(parseCollectionSort("rarity")).toBe("rarity");
    expect(parseCollectionSort("x")).toBe("newest");
  });
});