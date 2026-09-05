import { beforeEach, describe, expect, it } from "vitest";
import {
  enableMemoryMode,
  getMemoryEngine,
  getMemoryNominations,
  resetMemoryStoreForTests,
} from "@/lib/data/memory-store";
import {
  confirmOnchainTx,
  createCollectionForUser,
  createListingForUser,
  followArtist,
  listPendingNominations,
  nominateListingForUser,
  purchaseListing,
  recordSignal,
  settleNomination,
  transitionListingStage,
  withdrawPurchaseToWallet,
} from "@/lib/marketplace/service";
import { createShelf } from "@/lib/marketplace/editorial";
import { splitSaleProceeds } from "@/lib/fees/platform";

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

  it("creates a collection and attaches a scheduled drop", async () => {
    const collection = await createCollectionForUser({
      creatorId: "artist-fresh",
      title: "Dawn Set",
      network: "solana",
    });
    expect(collection.ok).toBe(true);
    if (!collection.ok) return;

    const start = Date.now() + 2 * 60 * 60 * 1000;
    const end = start + 3 * 60 * 60 * 1000;
    const drop = await createListingForUser({
      creatorId: "artist-fresh",
      title: "Dawn Drop",
      description: "scheduled OE",
      type: "open_edition",
      network: "solana",
      priceUsd: 18,
      medium: "digital",
      styleTags: ["dawn"],
      mediaContent: `dawn-drop-${Date.now()}`,
      collectionId: collection.collection.id,
      isCollectionHero: true,
      oeStartsAt: new Date(start).toISOString(),
      oeEndsAt: new Date(end).toISOString(),
      publishSoftLaunch: true,
    });
    expect(drop.ok).toBe(true);
    if (!drop.ok) return;
    expect(drop.listing.collectionId).toBe(collection.collection.id);
    expect(drop.listing.isCollectionHero).toBe(true);
    expect(drop.listing.oeStartsAt).toBeGreaterThan(Date.now());
    const stored = getMemoryEngine().state.collections.get(
      collection.collection.id,
    );
    expect(stored?.heroListingId).toBe(drop.listing.id);
    expect(stored?.totalItems).toBe(1);
  });

  it("rejects a collection piece without a collection and foreign collections", async () => {
    const missing = await createListingForUser({
      creatorId: "artist-fresh",
      title: "Loose piece",
      description: "",
      type: "collection",
      chain: "evm",
      priceUsd: 20,
      medium: "digital",
      styleTags: [],
      mediaContent: `loose-piece-${Date.now()}`,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors).toContain("collection_required");

    const collection = await createCollectionForUser({
      creatorId: "artist-fresh",
      title: "Owned Set",
      chain: "evm",
    });
    expect(collection.ok).toBe(true);
    if (!collection.ok) return;

    const stolen = await createListingForUser({
      creatorId: "artist-glitch",
      title: "Not yours",
      description: "",
      type: "collection",
      chain: "evm",
      priceUsd: 22,
      medium: "digital",
      styleTags: [],
      mediaContent: `stolen-piece-${Date.now()}`,
      collectionId: collection.collection.id,
    });
    expect(stolen.ok).toBe(false);
    if (!stolen.ok) expect(stolen.errors).toContain("collection_forbidden");
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

  it("counts listing page views without treating them as feed impressions", async () => {
    const listing = getMemoryEngine().state.listings.get("listing-fresh-1");
    expect(listing).toBeTruthy();
    if (!listing) return;
    const beforeImp = listing.signals.impressionsThisWeek;
    const beforeViews = listing.signals.pageViews;

    const viewed = await recordSignal({
      listingId: listing.id,
      viewerId: "collector-mira",
      type: "page_view",
    });
    expect(viewed.ok).toBe(true);
    const after = getMemoryEngine().state.listings.get(listing.id)!;
    expect(after.signals.pageViews).toBe(beforeViews + 1);
    expect(after.signals.impressionsThisWeek).toBe(beforeImp);

    const self = await recordSignal({
      listingId: listing.id,
      viewerId: listing.creatorId,
      type: "page_view",
    });
    expect(self.ok).toBe(true);
    expect(
      getMemoryEngine().state.listings.get(listing.id)!.signals.pageViews,
    ).toBe(beforeViews + 1);
  });

  it("purchases a listing in memory mode", async () => {
    const engine = getMemoryEngine();
    const { getMemoryPurchases } = await import("@/lib/data/memory-store");
    const sold = new Set(getMemoryPurchases().map((p) => p.listingId));
    const listing = [...engine.state.listings.values()].find(
      (l) =>
        l.priceUsd != null &&
        !l.delisted &&
        l.creatorId !== "collector-mira" &&
        !sold.has(l.id),
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
    expect(result.fees.feeTotalUsd).toBeCloseTo(listing.priceUsd * 0.03, 5);
    expect(result.fees.feeTreasuryUsd).toBeCloseTo(listing.priceUsd * 0.03, 5);
    expect(result.fees.feeOperatorUsd).toBe(0);
    expect(result.fees.sellerNetUsd).toBeCloseTo(listing.priceUsd * 0.97, 5);
    expect(
      engine.state.creators.get(listing.creatorId)?.completedSales,
    ).toBe(beforeSales + 1);
  });

  it("purchases unsold works on evm, solana, and boing", async () => {
    const cases = [
      { id: "listing-fresh-1", chain: "evm", network: "ethereum" },
      { id: "listing-glitch-oe", chain: "solana", network: "solana" },
      { id: "listing-boing-1", chain: "boing", network: "boing" },
    ] as const;

    for (const item of cases) {
      const listing = getMemoryEngine().state.listings.get(item.id);
      expect(listing, item.id).toBeTruthy();
      expect(listing?.chain).toBe(item.chain);
      expect(listing?.network).toBe(item.network);
      expect(listing?.priceUsd).toBeGreaterThan(0);

      const result = await purchaseListing({
        listingId: item.id,
        buyerId: "collector-kai",
        amountUsd: listing!.priceUsd!,
      });
      expect(result.ok, item.id).toBe(true);
      if (!result.ok) continue;
      expect(result.txHash).toBeTruthy();
      expect(result.chain).toBe(item.chain);
      expect(result.network).toBe(item.network);
      expect(result.fees.sellerNetUsd).toBe(
        splitSaleProceeds(listing!.priceUsd!).sellerNetUsd,
      );
      expect(result.walletTx).toBeUndefined();
    }
  });

  it("blocks a second buy on unique inventory and allows open editions", async () => {
    const first = await purchaseListing({
      listingId: "listing-nova-1",
      buyerId: "collector-kai",
      amountUsd: 120,
    });
    expect(first.ok).toBe(true);

    const again = await purchaseListing({
      listingId: "listing-nova-1",
      buyerId: "collector-mira",
      amountUsd: 120,
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe("already_sold");

    const soldAuction = await purchaseListing({
      listingId: "listing-fresh-sold-auction",
      buyerId: "collector-kai",
      amountUsd: 180,
    });
    expect(soldAuction.ok).toBe(false);

    const oe1 = await purchaseListing({
      listingId: "listing-glitch-oe",
      buyerId: "collector-kai",
      amountUsd: 25,
    });
    const oe2 = await purchaseListing({
      listingId: "listing-glitch-oe",
      buyerId: "collector-mira",
      amountUsd: 25,
    });
    expect(oe1.ok).toBe(true);
    expect(oe2.ok).toBe(true);
  });

  it("uses the listing price when amountUsd is omitted", async () => {
    const result = await purchaseListing({
      listingId: "listing-whale-featured",
      buyerId: "collector-mira",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fees.amountUsd).toBe(4200);
  });

  it("lets a signed-in buyer missing from the seed catalog purchase", async () => {
    const result = await purchaseListing({
      listingId: "listing-boing-1",
      buyerId: "user-unknown-collector",
      amountUsd: 32,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.network).toBe("boing");
  });

  it("builds a collection profile from the session when the catalog has no row", async () => {
    const { profileFromSession } = await import("@/lib/marketplace/profile");
    const profile = profileFromSession({
      id: "user-session-only",
      displayName: "Session Collector",
      wallets: [{ chain: "evm", address: "0xabc0000000000000000000000000000000000001" }],
      curatorScore: 10,
      verifiedCreator: false,
      role: "member",
      flagged: false,
      washCluster: false,
      firstListingAt: null,
      lifetimePrimaryVolumeUsd: 0,
      completedSales: 0,
      walletCreatedAt: new Date(),
      risingEntriesThisWeek: 0,
      openLaneListingsToday: 0,
      establishedBadge: false,
      totpEnabled: false,
      email: null,
      googleLinked: false,
      hasPassword: false,
      avatarUrl: null,
    });
    expect(profile.userId).toBe("user-session-only");
    expect(profile.wallets).toHaveLength(1);
    expect(profile.created).toEqual([]);
  });

  it("records a confirmed buy hash on the memory purchase", async () => {
    const bought = await purchaseListing({
      listingId: "listing-fresh-1",
      buyerId: "collector-kai",
      amountUsd: 45,
    });
    expect(bought.ok).toBe(true);

    const confirmed = await confirmOnchainTx({
      listingId: "listing-fresh-1",
      action: "buy",
      txHash: "0xconfirmedbuyhash1234567890",
      buyerId: "collector-kai",
    });
    expect(confirmed.ok).toBe(true);

    const { getMemoryPurchases } = await import("@/lib/data/memory-store");
    const row = getMemoryPurchases().find(
      (p) => p.listingId === "listing-fresh-1" && p.buyerId === "collector-kai",
    );
    expect(row?.txHash).toBe("0xconfirmedbuyhash1234567890");
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

  it("soft-launches a Boing listing without minting", async () => {
    const created = await createListingForUser({
      creatorId: "artist-fresh",
      title: "Boing Work",
      description: "native L1 mint",
      type: "single",
      network: "boing",
      priceUsd: 18,
      medium: "digital_ink",
      styleTags: ["boing"],
      mediaContent: `boing-media-${Date.now()}`,
      publishSoftLaunch: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.listing.chain).toBe("boing");
    expect(created.listing.network).toBe("boing");
    expect(created.listing.mintTxHash).toBeFalsy();
    expect("walletTx" in created && created.walletTx).toBeFalsy();
  });

  it("withdraws a collected listing to a wallet", async () => {
    const created = await createListingForUser({
      creatorId: "artist-fresh",
      title: "Withdraw Me",
      description: "",
      type: "single",
      network: "boing",
      priceUsd: 16,
      medium: "digital",
      styleTags: [],
      mediaContent: `withdraw-media-${Date.now()}`,
      publishSoftLaunch: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const bought = await purchaseListing({
      listingId: created.listing.id,
      buyerId: "collector-kai",
      amountUsd: 16,
    });
    expect(bought.ok).toBe(true);

    const { getMemoryPurchases } = await import("@/lib/data/memory-store");
    const purchase = getMemoryPurchases().find(
      (p) => p.listingId === created.listing.id && p.buyerId === "collector-kai",
    );
    expect(purchase).toBeTruthy();
    if (!purchase) return;

    const withdrawn = await withdrawPurchaseToWallet({
      purchaseId: purchase.id,
      buyerId: "collector-kai",
      destinationAddress: `0x${"ab".repeat(32)}`,
    });
    expect(withdrawn.ok).toBe(true);
    if (!withdrawn.ok) return;
    expect(withdrawn.txHash).toBeTruthy();
    expect(withdrawn.walletTx).toMatchObject({
      chain: "boing",
      method: "boing_sendTransaction",
    });
    expect(
      getMemoryPurchases().find((p) => p.id === purchase.id)?.withdrawnAt,
    ).toBeTruthy();

    const again = await withdrawPurchaseToWallet({
      purchaseId: purchase.id,
      buyerId: "collector-kai",
      destinationAddress: `0x${"ab".repeat(32)}`,
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe("already_withdrawn");
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
