import { describe, expect, it } from "vitest";
import {
  collectionVisibleOnCreatorProfile,
  mintedPublishedListingsInCollection,
} from "@/lib/marketplace/profile-collections";

const minted = {
  id: "a",
  stage: "soft_launch" as const,
  delisted: false,
  tokenId: "1",
  contractAddress: "0xabc",
  mintTxHash: "0xmint",
  mediaUrl: "/uploads/a.png",
  createdAt: 2,
};

describe("profile-collections", () => {
  it("hides collections with only drafts or unminted pieces", () => {
    expect(
      collectionVisibleOnCreatorProfile([
        {
          stage: "draft",
          tokenId: "1",
          contractAddress: "0xabc",
          mintTxHash: "0xmint",
        },
        {
          stage: "soft_launch",
          tokenId: null,
          contractAddress: null,
          mintTxHash: null,
        },
      ]),
    ).toBe(false);
  });

  it("shows collections with at least one minted published piece", () => {
    expect(collectionVisibleOnCreatorProfile([minted])).toBe(true);
  });

  it("counts only minted published listings for profile surfaces", () => {
    const pieces = mintedPublishedListingsInCollection([
      minted,
      {
        id: "b",
        stage: "draft",
        tokenId: "2",
        contractAddress: "0xabc",
        mintTxHash: "0xmint2",
        createdAt: 3,
      },
      {
        id: "c",
        stage: "rising_eligible",
        tokenId: "3",
        contractAddress: "0xabc",
        mintTxHash: "0xmint3",
        createdAt: 1,
      },
    ]);
    expect(pieces.map((p) => p.id)).toEqual(["a", "c"]);
  });
});
