import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enableMemoryMode,
  resetMemoryStoreForTests,
} from "@/lib/data/memory-store";

const probeBoingAccount = vi.fn();
const findBoingNftCollectionDeploy = vi.fn();

vi.mock("@/lib/onchain/boing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/onchain/boing")>();
  return {
    ...actual,
    probeBoingAccount: (...args: unknown[]) =>
      probeBoingAccount(...(args as [string])),
    findBoingNftCollectionDeploy: (...args: unknown[]) =>
      findBoingNftCollectionDeploy(...(args as [])),
  };
});

import {
  confirmCollectionDeploy,
  createCollectionForUser,
  createListingForUser,
  prepareCollectionPublishMints,
} from "@/lib/marketplace/service";

beforeEach(() => {
  resetMemoryStoreForTests();
  enableMemoryMode("unit-test");
  probeBoingAccount.mockReset();
  findBoingNftCollectionDeploy.mockReset();
  findBoingNftCollectionDeploy.mockResolvedValue(null);
});

describe("prepareCollectionPublishMints Boing account probes", () => {
  async function readyBoingCollection() {
    const creator = `0x${"33".repeat(32)}`;
    const created = await createCollectionForUser({
      creatorId: "artist-fresh",
      title: "Probe Squad",
      slug: `probe-squad-${Date.now()}`,
      network: "boing",
      creatorAddress: creator,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("create failed");
    const real = `0x${"77".repeat(32)}`;
    const confirmed = await confirmCollectionDeploy({
      collectionId: created.collection.id,
      creatorId: "artist-fresh",
      txHash: `0x${"ab".repeat(32)}`,
      contractAddress: real,
      creatorAddress: creator,
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) throw new Error("confirm failed");

    const piece = await createListingForUser({
      creatorId: "artist-fresh",
      title: "Probe Piece",
      description: "",
      type: "collection",
      network: "boing",
      priceUsd: 9,
      medium: "digital",
      styleTags: [],
      mediaContent: `probe-piece-${Date.now()}`,
      collectionId: created.collection.id,
      publishSoftLaunch: true,
    });
    expect(piece.ok).toBe(true);
    if (!piece.ok) throw new Error("listing failed");
    return {
      collectionId: created.collection.id,
      listingId: piece.listing.id,
      creator,
      contract: real,
    };
  }

  it("fails closed when contract probe stays unknown", async () => {
    const ctx = await readyBoingCollection();
    probeBoingAccount.mockResolvedValue("unknown");

    const prepared = await prepareCollectionPublishMints({
      collectionId: ctx.collectionId,
      creatorId: "artist-fresh",
      listingIds: [ctx.listingId],
      creatorAddress: ctx.creator,
    });
    expect(prepared.ok).toBe(false);
    if (!prepared.ok) {
      expect(prepared.error).toBe("boing_account_probe_unknown");
    }
    // Retry once per probeExists call.
    expect(probeBoingAccount.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("fails closed when collection account is missing and heal finds nothing", async () => {
    const ctx = await readyBoingCollection();
    probeBoingAccount.mockResolvedValue("missing");
    findBoingNftCollectionDeploy.mockResolvedValue(null);

    const prepared = await prepareCollectionPublishMints({
      collectionId: ctx.collectionId,
      creatorId: "artist-fresh",
      listingIds: [ctx.listingId],
      creatorAddress: ctx.creator,
    });
    expect(prepared.ok).toBe(false);
    if (!prepared.ok) {
      expect(prepared.error).toBe("boing_collection_account_missing");
    }
  });

  it("heals a dead contract AccountId then prepares when probes exist", async () => {
    const ctx = await readyBoingCollection();
    const healed = `0x${"88".repeat(32)}`;
    findBoingNftCollectionDeploy.mockResolvedValue({
      contractAddress: healed,
      txNonce: 3,
      blockHeight: 100,
      assetName: "Probe Squad",
    });
    probeBoingAccount.mockImplementation(async (id: string) => {
      const n = id.toLowerCase();
      if (n === ctx.contract.toLowerCase()) return "missing";
      if (n === healed.toLowerCase() || n === ctx.creator.toLowerCase()) {
        return "exists";
      }
      return "missing";
    });

    const prepared = await prepareCollectionPublishMints({
      collectionId: ctx.collectionId,
      creatorId: "artist-fresh",
      listingIds: [ctx.listingId],
      creatorAddress: ctx.creator,
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.batches.length).toBeGreaterThan(0);
    expect(findBoingNftCollectionDeploy).toHaveBeenCalled();
  });
});
