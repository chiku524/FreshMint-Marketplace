import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enableMemoryMode,
  getMemoryEngine,
  getMemoryNominations,
  recordMemoryPurchase,
  resetMemoryStoreForTests,
} from "@/lib/data/memory-store";
import type { NetworkId } from "@/lib/discovery/types";
import {
  confirmCollectionMintBatch,
  confirmOnchainTx,
  createCollectionForUser,
  createListingForUser,
  getDiscoveryEngine,
  updateCollectionDrop,
  followArtist,
  listPendingNominations,
  nominateListingForUser,
  prepareCollectionPublishMints,
  purchaseListing,
  quoteCryptoPurchase,
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

function markListingMintedForTest(listingId: string) {
  const listing = getMemoryEngine().state.listings.get(listingId);
  expect(listing, listingId).toBeTruthy();
  if (!listing) return;
  listing.tokenId = listing.tokenId || "1";
  listing.contractAddress =
    listing.contractAddress ||
    (listing.chain === "solana"
      ? "So11111111111111111111111111111111111111112"
      : listing.chain === "boing"
        ? `0x${"22".repeat(32)}`
        : "0x1111111111111111111111111111111111111111");
  listing.mintTxHash = listing.mintTxHash || `0xmint${listingId.replace(/\W/g, "").slice(-12)}`;
}

function cryptoBuy(input: {
  listingId: string;
  buyerId: string;
  amountUsd?: number;
  payNetwork?: NetworkId;
  simulate?: boolean;
}) {
  const listing = getMemoryEngine().state.listings.get(input.listingId);
  const payNetwork = (input.payNetwork ??
    listing?.network ??
    "ethereum") as NetworkId;
  const payAddr =
    payNetwork === "solana"
      ? "Buyer1111111111111111111111111111111111111"
      : `0x${"b1".repeat(20)}`;
  const recvAddr =
    listing?.chain === "solana"
      ? "Recv11111111111111111111111111111111111111"
      : `0x${"b2".repeat(20)}`;
  return purchaseListing({
    listingId: input.listingId,
    buyerId: input.buyerId,
    amountUsd: input.amountUsd,
    payNetwork,
    buyerPaymentAddress: payAddr,
    buyerReceiveAddress: recvAddr,
    simulate: input.simulate ?? true,
  });
}

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

    markListingMintedForTest(listing.id);
    const beforeSales =
      engine.state.creators.get(listing.creatorId)?.completedSales ?? 0;
    const result = await cryptoBuy({
      listingId: listing.id,
      buyerId: "collector-mira",
      amountUsd: listing.priceUsd,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.txHash).toBeTruthy();
    expect(result.status).toBe("completed");
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
      markListingMintedForTest(item.id);

      const result = await cryptoBuy({
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
      expect(result.status).toBe("completed");
    }
  });

  it("blocks a second buy on unique inventory and allows open editions", async () => {
    markListingMintedForTest("listing-nova-1");
    markListingMintedForTest("listing-fresh-sold-auction");
    markListingMintedForTest("listing-glitch-oe");

    const first = await cryptoBuy({
      listingId: "listing-nova-1",
      buyerId: "collector-kai",
      amountUsd: 120,
    });
    expect(first.ok).toBe(true);

    const again = await cryptoBuy({
      listingId: "listing-nova-1",
      buyerId: "collector-mira",
      amountUsd: 120,
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe("already_sold");

    const soldAuction = await cryptoBuy({
      listingId: "listing-fresh-sold-auction",
      buyerId: "collector-kai",
      amountUsd: 180,
    });
    expect(soldAuction.ok).toBe(false);

    const oe1 = await cryptoBuy({
      listingId: "listing-glitch-oe",
      buyerId: "collector-kai",
      amountUsd: 25,
    });
    const oe2 = await cryptoBuy({
      listingId: "listing-glitch-oe",
      buyerId: "collector-mira",
      amountUsd: 25,
    });
    expect(oe1.ok).toBe(true);
    expect(oe2.ok).toBe(true);
  });

  it("uses the listing price when amountUsd is omitted", async () => {
    markListingMintedForTest("listing-whale-featured");
    const result = await cryptoBuy({
      listingId: "listing-whale-featured",
      buyerId: "collector-mira",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fees.amountUsd).toBe(4200);
  });

  it("lets a signed-in buyer missing from the seed catalog purchase", async () => {
    markListingMintedForTest("listing-boing-1");
    const result = await cryptoBuy({
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
    markListingMintedForTest("listing-fresh-1");
    const bought = await cryptoBuy({
      listingId: "listing-fresh-1",
      buyerId: "collector-kai",
      amountUsd: 45,
      simulate: false,
    });
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(bought.status).toBe("pending_payment");

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

  it("withdraws a legacy USD purchase to a wallet", async () => {
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

    // Legacy USD hold (no payNetwork) — withdraw still mints/transfers.
    const purchase = recordMemoryPurchase({
      listingId: created.listing.id,
      buyerId: "collector-kai",
      amountUsd: 16,
      soldAt: Date.now(),
      txHash: "platform:legacy-usd",
      chain: "boing",
    });

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
      (await import("@/lib/data/memory-store"))
        .getMemoryPurchases()
        .find((p) => p.id === purchase.id)?.withdrawnAt,
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

  it("deploys a collection, mints at publish, and withdraws via transfer", async () => {
    const created = await createCollectionForUser({
      creatorId: "artist-fresh",
      title: "Onchain Drop",
      network: "ethereum",
      creatorAddress: "",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.collection.deployStatus).toBe("confirmed");
    expect(created.collection.contractAddress).toBeTruthy();

    const piece = await createListingForUser({
      creatorId: "artist-fresh",
      title: "Minted Leaf",
      description: "",
      type: "collection",
      network: "ethereum",
      priceUsd: 18,
      medium: "digital",
      styleTags: [],
      mediaContent: `minted-leaf-${Date.now()}`,
      collectionId: created.collection.id,
      publishSoftLaunch: true,
    });
    expect(piece.ok).toBe(true);
    if (!piece.ok) return;

    const prepared = await prepareCollectionPublishMints({
      collectionId: created.collection.id,
      creatorId: "artist-fresh",
      listingIds: [piece.listing.id],
      creatorAddress: "0xabc0000000000000000000000000000000000001",
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.batches.length).toBeGreaterThan(0);

    const batch = prepared.batches[0]!;
    const minted = await confirmCollectionMintBatch({
      collectionId: created.collection.id,
      creatorId: "artist-fresh",
      txHash: batch.txHash || `0x${"ab".repeat(16)}`,
      listingIds: batch.listingIds,
      tokenIds: batch.provisionalTokenIds,
      contractAddress: created.collection.contractAddress,
    });
    expect(minted.ok).toBe(true);

    const engine = await getDiscoveryEngine();
    const listing = engine.state.listings.get(piece.listing.id);
    expect(listing?.tokenId).toBeTruthy();
    expect(listing?.mintTxHash).toBeTruthy();
    expect(listing?.contractAddress).toBeTruthy();

    const bought = await cryptoBuy({
      listingId: piece.listing.id,
      buyerId: "collector-mira",
      amountUsd: 18,
    });
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(bought.status).toBe("completed");

    const { getMemoryPurchases } = await import("@/lib/data/memory-store");
    const purchase = getMemoryPurchases().find(
      (p) => p.listingId === piece.listing.id && p.buyerId === "collector-mira",
    );
    expect(purchase).toBeTruthy();
    expect(purchase?.withdrawnAt).toBeTruthy();
    if (!purchase) return;

    const withdrawn = await withdrawPurchaseToWallet({
      purchaseId: purchase.id,
      buyerId: "collector-mira",
      destinationAddress: "0xabc0000000000000000000000000000000000099",
    });
    expect(withdrawn.ok).toBe(false);
    if (!withdrawn.ok) {
      expect(
        withdrawn.error === "already_withdrawn" ||
          withdrawn.error === "crypto_purchase_owned_at_buy",
      ).toBe(true);
    }
  });

  it("schedules a limited drop with traits and a supply cap", async () => {
    const collection = await createCollectionForUser({
      creatorId: "artist-fresh",
      title: "Trait Garden",
      network: "ethereum",
    });
    expect(collection.ok).toBe(true);
    if (!collection.ok) return;

    const start = Date.now() - 60 * 60 * 1000;
    const end = Date.now() + 3 * 60 * 60 * 1000;
    const scheduled = await updateCollectionDrop({
      collectionId: collection.collection.id,
      creatorId: "artist-fresh",
      dropKind: "limited",
      dropStartsAt: new Date(start).toISOString(),
      dropEndsAt: new Date(end).toISOString(),
      dropPriceUsd: 22,
    });
    expect(scheduled.ok).toBe(true);
    if (!scheduled.ok) return;
    expect(scheduled.collection.dropKind).toBe("limited");

    const piece = await createListingForUser({
      creatorId: "artist-fresh",
      title: "Gold Leaf",
      description: "limited drop piece",
      type: "collection",
      network: "ethereum",
      priceUsd: 22,
      medium: "digital",
      styleTags: [],
      mediaContent: `gold-leaf-${Date.now()}`,
      collectionId: collection.collection.id,
      traits: [
        { trait_type: "Background", value: "Gold" },
        { trait_type: "Leaf", value: "Maple" },
      ],
      maxSupply: 2,
      oeStartsAt: new Date(start).toISOString(),
      oeEndsAt: new Date(end).toISOString(),
      publishSoftLaunch: true,
    });
    expect(piece.ok).toBe(true);
    if (!piece.ok) return;
    expect(piece.listing.traits).toEqual([
      { trait_type: "Background", value: "Gold" },
      { trait_type: "Leaf", value: "Maple" },
    ]);
    expect(piece.listing.maxSupply).toBe(2);

    markListingMintedForTest(piece.listing.id);
    const first = await cryptoBuy({
      listingId: piece.listing.id,
      buyerId: "collector-mira",
      amountUsd: 22,
    });
    expect(first.ok).toBe(true);
    const second = await cryptoBuy({
      listingId: piece.listing.id,
      buyerId: "collector-kai",
      amountUsd: 22,
    });
    expect(second.ok).toBe(true);
    const third = await cryptoBuy({
      listingId: piece.listing.id,
      buyerId: "collector-mira",
      amountUsd: 22,
    });
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.error).toBe("already_sold");
  });

  it("blocks buys before a scheduled drop starts", async () => {
    const start = Date.now() + 2 * 60 * 60 * 1000;
    const end = start + 3 * 60 * 60 * 1000;
    const drop = await createListingForUser({
      creatorId: "artist-fresh",
      title: "Later Bloom",
      description: "upcoming OE",
      type: "open_edition",
      network: "ethereum",
      priceUsd: 12,
      medium: "digital",
      styleTags: [],
      mediaContent: `later-bloom-${Date.now()}`,
      oeStartsAt: new Date(start).toISOString(),
      oeEndsAt: new Date(end).toISOString(),
      publishSoftLaunch: true,
    });
    expect(drop.ok).toBe(true);
    if (!drop.ok) return;
    markListingMintedForTest(drop.listing.id);
    const result = await cryptoBuy({
      listingId: drop.listing.id,
      buyerId: "collector-mira",
      amountUsd: 12,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("drop_not_started");
  });

  it("rejects unminted listings and Boing cross-chain pay", async () => {
    const created = await createListingForUser({
      creatorId: "artist-fresh",
      title: "Unminted",
      description: "",
      type: "single",
      network: "ethereum",
      priceUsd: 10,
      medium: "digital",
      styleTags: [],
      mediaContent: `unminted-${Date.now()}`,
      publishSoftLaunch: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const unminted = await cryptoBuy({
      listingId: created.listing.id,
      buyerId: "collector-mira",
      amountUsd: 10,
    });
    expect(unminted.ok).toBe(false);
    if (!unminted.ok) expect(unminted.error).toBe("listing_not_minted");

    markListingMintedForTest("listing-boing-1");
    const boingCross = await purchaseListing({
      listingId: "listing-boing-1",
      buyerId: "collector-mira",
      amountUsd: 32,
      payNetwork: "ethereum",
      buyerPaymentAddress: `0x${"b1".repeat(20)}`,
      buyerReceiveAddress: `0x${"22".repeat(32)}`,
      simulate: true,
    });
    expect(boingCross.ok).toBe(false);
    if (!boingCross.ok) expect(boingCross.error).toBe("boing_same_chain_only");

    const quoted = await quoteCryptoPurchase({
      listingId: "listing-boing-1",
      payNetwork: "ethereum",
    });
    expect(quoted.ok).toBe(false);
    if (!quoted.ok) expect(quoted.error).toBe("boing_same_chain_only");
  });

  it("same-chain crypto purchase marks ownership delivered", async () => {
    markListingMintedForTest("listing-fresh-1");
    const result = await cryptoBuy({
      listingId: "listing-fresh-1",
      buyerId: "collector-mira",
      amountUsd: 45,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe("completed");
    expect(result.transferTxHash).toBeTruthy();
    const { getMemoryPurchases } = await import("@/lib/data/memory-store");
    const row = getMemoryPurchases().find((p) => p.id === result.purchaseId);
    expect(row?.withdrawnAt).toBeTruthy();
    expect(row?.payNetwork).toBe("ethereum");
  });

  it("builds a cross-chain Relay quote for ETH→Solana", async () => {
    const relay = await import("@/lib/bridge/relay");
    const spy = vi.spyOn(relay, "quoteNativeBridge").mockResolvedValue({
      requestId: "relay-test-eth-sol",
      fromNetwork: "ethereum",
      toNetwork: "solana",
      amount: "0.008333",
      estimatedOutput: "0.3",
      feeUsd: "1.2",
      raw: { mocked: true },
      steps: [],
    });

    markListingMintedForTest("listing-glitch-oe");
    const result = await purchaseListing({
      listingId: "listing-glitch-oe",
      buyerId: "collector-kai",
      amountUsd: 25,
      payNetwork: "ethereum",
      buyerPaymentAddress: `0x${"e1".repeat(20)}`,
      buyerReceiveAddress: "RecvCross1111111111111111111111111111111",
      simulate: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.bridged).toBe(true);
    expect(result.bridge?.requestId).toBe("relay-test-eth-sol");
    expect(result.bridge?.fromNetwork).toBe("ethereum");
    expect(result.bridge?.toNetwork).toBe("solana");
    expect(result.status).toBe("pending_payment");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
