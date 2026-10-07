import { describe, expect, it } from "vitest";
import type { Collection, Listing } from "@/lib/discovery/types";
import {
  buildStudioCollectionRows,
  countStudioAttention,
} from "@/lib/marketplace/studio-hub";

function collection(partial: Partial<Collection> & { id: string; title: string }): Collection {
  return {
    creatorId: "u1",
    chain: "boing",
    network: "boing",
    totalItems: 0,
    sampleListingIds: [],
    createdAt: 1_000,
    deployStatus: "none",
    ...partial,
  } as Collection;
}

function listing(
  partial: Partial<Listing> & { id: string; collectionId: string; stage: string },
): Listing {
  return {
    creatorId: "u1",
    title: partial.id,
    chain: "boing",
    network: "boing",
    type: "single",
    priceUsd: 10,
    createdAt: 2_000,
    mediaUrl: "/x.png",
    ...partial,
  } as Listing;
}

describe("buildStudioCollectionRows", () => {
  it("prioritizes collections that need attention", () => {
    const rows = buildStudioCollectionRows({
      collections: [
        collection({
          id: "live",
          title: "Live Set",
          deployStatus: "confirmed",
          contractAddress: "0xabc1234567890",
          createdAt: 100,
        }),
        collection({
          id: "drafty",
          title: "Draft Set",
          deployStatus: "none",
          createdAt: 50,
        }),
      ],
      listings: [
        listing({
          id: "l1",
          collectionId: "live",
          stage: "soft_launch",
          tokenId: "1",
          contractAddress: "0xabc1234567890",
          mintTxHash: "0xmint",
          createdAt: 300,
        }),
        listing({
          id: "d1",
          collectionId: "drafty",
          stage: "draft",
          createdAt: 200,
        }),
      ],
    });

    expect(rows[0]?.id).toBe("drafty");
    expect(rows[0]?.needsAttention).toBe(true);
    expect(rows[0]?.primaryAction.id).toBe("finish_publish");
    expect(rows[0]?.primaryAction.href).toContain("/collections/");
    expect(rows[1]?.id).toBe("live");
    expect(rows[1]?.phaseLabel).toBe("Live");
    expect(rows[1]?.primaryAction.id).toBe("view_live");
  });

  it("points empty undeployed collections at continue setup", () => {
    const rows = buildStudioCollectionRows({
      collections: [
        collection({ id: "empty", title: "Empty", slug: "empty-set" }),
      ],
      listings: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.phaseLabel).toBe("Empty draft");
    expect(rows[0]?.primaryAction.id).toBe("add_works");
    expect(rows[0]?.primaryAction.href).toContain("collectionId=empty");
    expect(rows[0]?.primaryAction.label).toMatch(/continue setup/i);
  });

  it("labels soft-launch when minted drafts remain private", () => {
    const rows = buildStudioCollectionRows({
      collections: [
        collection({
          id: "c1",
          title: "Almost",
          deployStatus: "confirmed",
          contractAddress: "0xdeadbeef01",
        }),
      ],
      listings: [
        listing({
          id: "m1",
          collectionId: "c1",
          stage: "draft",
          tokenId: "1",
          contractAddress: "0xdeadbeef01",
          mintTxHash: "0xrealmint",
        }),
      ],
    });
    expect(rows[0]?.phaseLabel).toBe("Ready to launch");
    expect(rows[0]?.primaryAction.label).toMatch(/soft-launch/i);
    expect(countStudioAttention(rows)).toBe(1);
  });
});
