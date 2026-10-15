import { describe, expect, it } from "vitest";
import {
  buildCollectionPublishLifecycle,
  buildListingPublishLifecycle,
  wizardBusyPhase,
} from "@/lib/marketplace/publish-status";

describe("buildCollectionPublishLifecycle", () => {
  it("starts at draft when nothing is on-chain", () => {
    const snap = buildCollectionPublishLifecycle({
      deployStatus: "none",
      draftCount: 2,
      mintedDraftCount: 0,
      unmintedDraftCount: 2,
      liveCount: 0,
    });
    expect(snap.current).toBe("draft");
    expect(snap.steps.find((s) => s.id === "draft")?.status).toBe("current");
    expect(snap.summary).toMatch(/deploy/i);
  });

  it("moves to mint after confirmed deploy with unminted drafts", () => {
    const snap = buildCollectionPublishLifecycle({
      deployStatus: "confirmed",
      contractAddress: "0xabc123456789",
      draftCount: 3,
      mintedDraftCount: 0,
      unmintedDraftCount: 3,
      liveCount: 0,
    });
    expect(snap.current).toBe("mint");
    expect(snap.steps.find((s) => s.id === "deploy")?.status).toBe("done");
    expect(snap.steps.find((s) => s.id === "mint")?.status).toBe("current");
    expect(snap.summary).toMatch(/mint/i);
  });

  it("marks deploy failed explicitly", () => {
    const snap = buildCollectionPublishLifecycle({
      deployStatus: "failed",
      draftCount: 1,
      mintedDraftCount: 0,
      unmintedDraftCount: 1,
      liveCount: 0,
      progressNote: "Contract was not found — re-deploy required",
    });
    expect(snap.steps.find((s) => s.id === "deploy")?.status).toBe("failed");
    expect(snap.summary).toMatch(/re-deploy|not found/i);
  });

  it("highlights soft-launch when minted drafts remain private", () => {
    const snap = buildCollectionPublishLifecycle({
      deployStatus: "confirmed",
      contractAddress: "0xdeadbeef01",
      draftCount: 2,
      mintedDraftCount: 2,
      unmintedDraftCount: 0,
      liveCount: 0,
    });
    expect(snap.current).toBe("live");
    expect(snap.summary).toMatch(/soft-launch/i);
  });

  it("honors busyPhase while wallet work runs", () => {
    const snap = buildCollectionPublishLifecycle({
      deployStatus: "pending_wallet",
      draftCount: 1,
      mintedDraftCount: 0,
      unmintedDraftCount: 1,
      liveCount: 0,
      busyPhase: "deploy",
      progressNote: "Confirm collection deploy in your wallet…",
    });
    expect(snap.current).toBe("deploy");
    expect(snap.steps.find((s) => s.id === "deploy")?.detail).toMatch(/wallet/i);
  });
});

describe("buildListingPublishLifecycle", () => {
  it("shows mint as current when collection is deployed but listing is not minted", () => {
    const snap = buildListingPublishLifecycle({
      stage: "draft",
      collectionDeployStatus: "confirmed",
      collectionContractAddress: "0xabc",
    });
    expect(snap.current).toBe("mint");
    expect(snap.summary).toMatch(/mint/i);
  });

  it("points minted drafts at soft-launch", () => {
    const snap = buildListingPublishLifecycle({
      stage: "draft",
      tokenId: "1",
      contractAddress: "0xabc",
      mintTxHash: "0xmint",
      collectionDeployStatus: "confirmed",
      collectionContractAddress: "0xabc",
    });
    expect(snap.current).toBe("live");
    expect(snap.summary).toMatch(/soft-launch/i);
  });
});

describe("wizardBusyPhase", () => {
  it("maps progress flags to phases", () => {
    expect(
      wizardBusyPhase({
        listProgress: true,
        deployNote: null,
        mintProgress: false,
        published: false,
      }),
    ).toBe("draft");
    expect(
      wizardBusyPhase({
        listProgress: false,
        deployNote: "Deploying…",
        mintProgress: false,
        published: false,
      }),
    ).toBe("deploy");
    expect(
      wizardBusyPhase({
        listProgress: false,
        deployNote: null,
        mintProgress: true,
        published: false,
      }),
    ).toBe("mint");
    expect(
      wizardBusyPhase({
        listProgress: false,
        deployNote: null,
        mintProgress: false,
        published: true,
      }),
    ).toBe("live");
  });
});
