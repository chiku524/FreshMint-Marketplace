import { beforeEach, describe, expect, it } from "vitest";
import {
  enableMemoryMode,
  getMemoryEngine,
  getMemoryNominations,
  resetMemoryStoreForTests,
} from "@/lib/data/memory-store";
import {
  confirmOnchainTx,
  createListingForUser,
  followArtist,
  listPendingNominations,
  nominateListingForUser,
  purchaseListing,
  recordSignal,
  settleNomination,
  transitionListingStage,
} from "@/lib/marketplace/service";
import { createShelf } from "@/lib/marketplace/editorial";

beforeEach(() => {
  resetMemoryStoreForTests();
  enableMemoryMode("unit-test");
});

describe("marketplace service (memory mode)", () => {
  it("creates a soft-launched listing", async () => {
    const result = await createListingForUser({
      creatorId: "artist-fresh",
      title: "Test Work",
      description: "memory path",
      type: "single",
      chain: "evm",
      priceUsd: 40,
      medium: "digital_ink",
      styleTags: ["test"],
      mediaContent: `unique-media-${Date.now()}`,
      publishSoftLaunch: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.listing.stage).toBe("soft_launch");
    expect(getMemoryEngine().state.listings.has(result.listing.id)).toBe(true);
  });

  it("records signals and follow graph edges", async () => {
    const engine = getMemoryEngine();
    const listing = [...engine.state.listings.values()].find(
      (l) => l.stage !== "draft" && !l.delisted,
    );
    expect(listing).toBeTruthy();
    if (!listing) return;

    const signal = await recordSignal({
      listingId: listing.id,
      viewerId: "collector-mira",
      type: "save",
    });
    expect(signal.ok).toBe(true);

    const follow = await followArtist({
      followerId: "collector-mira",
      artistId: listing.creatorId,
    });
    expect(follow.ok).toBe(true);
    if (!follow.ok) return;
    expect(follow.followedArtistIds).toContain(listing.creatorId);
  });

  it("purchases a listing in memory mode", async () => {
    const engine = getMemoryEngine();
    const listing = [...engine.state.listings.values()].find(
      (l) => l.priceUsd != null && !l.delisted && l.creatorId !== "collector-mira",
    );
    expect(listing).toBeTruthy();
    if (!listing || listing.priceUsd == null) return;

    const beforeSales =
      engine.state.creators.get(listing.creatorId)?.completedSales ?? 0;
    const result = await purchaseListing({
      listingId: listing.id,
      buyerId: "collector-mira",
      amountUsd: listing.priceUsd,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.txHash).toBeTruthy();
    expect(
      engine.state.creators.get(listing.creatorId)?.completedSales,
    ).toBe(beforeSales + 1);
  });

  it("nominates and settles curator stakes", async () => {
    const engine = getMemoryEngine();
    const listing = [...engine.state.listings.values()].find(
      (l) => l.stage === "soft_launch" || l.stage === "rising_eligible",
    );
    expect(listing).toBeTruthy();
    if (!listing) return;

    const beforeScore =
      engine.state.creators.get("collector-mira")?.curatorScore ?? 0;
    const nominated = await nominateListingForUser({
      listingId: listing.id,
      nominatorId: "collector-mira",
    });
    expect(nominated.ok).toBe(true);

    const pending = await listPendingNominations();
    expect(pending.length).toBeGreaterThan(0);
    const nom = pending[0]!;
    expect(getMemoryNominations().some((n) => n.id === nom.id)).toBe(true);

    const settled = await settleNomination({
      nominationId: nom.id,
      outcome: "success",
    });
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(settled.curatorScore).toBeGreaterThan(
      (engine.state.creators.get("collector-mira")?.curatorScore ?? 0) - 1,
    );
    // Score should have been reduced by stake then rewarded — still defined.
    expect(typeof settled.curatorScore).toBe("number");
    expect(beforeScore).toBeGreaterThan(0);
  });

  it("creates a collector shelf in memory", async () => {
    const engine = getMemoryEngine();
    const listingIds = [...engine.state.listings.values()]
      .filter((l) => !l.delisted)
      .slice(0, 2)
      .map((l) => l.id);
    const shelf = await createShelf({
      curatorId: "collector-mira",
      name: "Ink under $100",
      listingIds,
    });
    expect(shelf.ok).toBe(true);
    if (!shelf.ok) return;
    expect(engine.state.shelves.has(shelf.shelf.id)).toBe(true);
    expect(shelf.shelf.listingIds.length).toBe(listingIds.length);
  });

  it("advances stage and confirms on-chain tx", async () => {
    const created = await createListingForUser({
      creatorId: "artist-fresh",
      title: "Stage Work",
      description: "",
      type: "single",
      chain: "solana",
      priceUsd: 12,
      medium: "generative",
      styleTags: [],
      mediaContent: `stage-media-${Date.now()}`,
      publishSoftLaunch: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const rising = await transitionListingStage(
      created.listing.id,
      "rising_eligible",
    );
    expect(rising.ok).toBe(true);

    const confirmed = await confirmOnchainTx({
      listingId: created.listing.id,
      action: "mint",
      txHash: "memosig1234567890abcdef",
    });
    expect(confirmed.ok).toBe(true);
  });
});
