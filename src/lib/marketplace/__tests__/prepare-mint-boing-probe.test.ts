import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enableMemoryMode,
  resetMemoryStoreForTests,
} from "@/lib/data/memory-store";

const probeBoingAccount = vi.fn();
const probeBoingNftCollection = vi.fn();
const findBoingNftCollectionDeploy = vi.fn();
const resolveBoingDeployContractAddress = vi.fn();

vi.mock("@/lib/onchain/boing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/onchain/boing")>();
  return {
    ...actual,
    probeBoingAccount: (...args: unknown[]) =>
      probeBoingAccount(...(args as [string])),
    probeBoingNftCollection: (...args: unknown[]) =>
      probeBoingNftCollection(...(args as [string])),
    findBoingNftCollectionDeploy: (...args: unknown[]) =>
      findBoingNftCollectionDeploy(...(args as [])),
    resolveBoingDeployContractAddress: (...args: unknown[]) =>
      resolveBoingDeployContractAddress(...(args as [])),
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
  probeBoingNftCollection.mockReset();
  findBoingNftCollectionDeploy.mockReset();
  resolveBoingDeployContractAddress.mockReset();
  findBoingNftCollectionDeploy.mockResolvedValue(null);
  resolveBoingDeployContractAddress.mockResolvedValue(null);
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
    // confirmCollectionDeploy probes the contract — allow it through.
    probeBoingNftCollection.mockResolvedValue("exists");
    probeBoingAccount.mockResolvedValue("exists");
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
    probeBoingNftCollection.mockReset();
    probeBoingAccount.mockReset();
    findBoingNftCollectionDeploy.mockReset();
    resolveBoingDeployContractAddress.mockReset();
    findBoingNftCollectionDeploy.mockResolvedValue(null);
    resolveBoingDeployContractAddress.mockResolvedValue(null);
    return {
      collectionId: created.collection.id,
      listingId: piece.listing.id,
      creator,
      contract: real,
    };
  }

  it("fails closed when contract probe stays unknown", async () => {
    const ctx = await readyBoingCollection();
    probeBoingNftCollection.mockResolvedValue("unknown");
    probeBoingAccount.mockResolvedValue("exists");

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
    expect(probeBoingNftCollection.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("fails closed when collection account is missing and heal finds nothing", async () => {
    const ctx = await readyBoingCollection();
    probeBoingNftCollection.mockResolvedValue("missing");
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
    resolveBoingDeployContractAddress.mockResolvedValue(healed);
    probeBoingNftCollection.mockImplementation(async (id: string) => {
      const n = id.toLowerCase();
      if (n === ctx.contract.toLowerCase()) return "missing";
      if (n === healed.toLowerCase()) return "exists";
      return "missing";
    });
    probeBoingAccount.mockImplementation(async (id: string) => {
      const n = id.toLowerCase();
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
    if (!prepared.ok) {
      throw new Error(`heal prepare failed: ${prepared.error}`);
    }
    expect(prepared.batches.length).toBeGreaterThan(0);
    expect(resolveBoingDeployContractAddress).toHaveBeenCalled();
  });

  it("forceRedeploy clears a dead confirmed contract and returns a wallet intent", async () => {
    const { prepareCollectionDeployForUser, syncCollectionDeployFromChain } =
      await import("@/lib/marketplace/service");
    const ctx = await readyBoingCollection();
    probeBoingNftCollection.mockResolvedValue("missing");
    probeBoingAccount.mockResolvedValue("missing");
    findBoingNftCollectionDeploy.mockResolvedValue(null);

    const synced = await syncCollectionDeployFromChain({
      collectionId: ctx.collectionId,
      creatorId: "artist-fresh",
      creatorAddress: ctx.creator,
    });
    expect(synced.ok).toBe(false);
    if (!synced.ok) {
      expect(synced.error).toBe("boing_collection_account_missing");
    }

    const prep = await prepareCollectionDeployForUser({
      collectionId: ctx.collectionId,
      creatorId: "artist-fresh",
      creatorAddress: ctx.creator,
      forceRedeploy: true,
    });
    expect(prep.ok).toBe(true);
    if (!prep.ok) return;
    expect(prep.alreadyDeployed).toBe(false);
    expect(prep.deployIntent?.walletTx).toBeTruthy();
  });

  it("forceRedeploy does not wipe deploy when contract probe is unknown", async () => {
    const { prepareCollectionDeployForUser } = await import(
      "@/lib/marketplace/service"
    );
    const ctx = await readyBoingCollection();
    probeBoingNftCollection.mockResolvedValue("unknown");

    const prep = await prepareCollectionDeployForUser({
      collectionId: ctx.collectionId,
      creatorId: "artist-fresh",
      creatorAddress: ctx.creator,
      forceRedeploy: true,
    });
    expect(prep.ok).toBe(false);
    if (!prep.ok) {
      expect(prep.error).toBe("boing_account_probe_unknown");
    }
  });
});
