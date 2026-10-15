import { beforeEach, describe, expect, it } from "vitest";
import {
  enableMemoryMode,
  getMemoryEngine,
  recordMemoryPurchase,
  resetMemoryStoreForTests,
} from "@/lib/data/memory-store";
import {
  collectFridayRaffleEligible,
  pickFridayRaffleWinner,
  raffleSortKey,
  resetMemoryFridayRafflesForTests,
  runFridayTreasuryRaffle,
  claimFridayRafflePrize,
} from "@/lib/marketplace/friday-treasury-raffle";
import { TREASURY_FRIDAY_COPY } from "@/lib/marketplace/friday-treasury-copy";
import { runFridayTreasuryBuys } from "@/lib/marketplace/friday-treasury-buy";

beforeEach(() => {
  resetMemoryStoreForTests();
  resetMemoryFridayRafflesForTests();
  enableMemoryMode("unit-test");
  process.env.NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS =
    "0xDde8Ec0A27467a8Eb6E7a3245e07d2D67B6B56bb";
  process.env.NEXT_PUBLIC_PLATFORM_TREASURY_SOLANA =
    "3u2DbBkCqoSQmcreHfwQWDekJ8HPctgns3v6L3LdupwW";
  delete process.env.TREASURY_FRIDAY_RAFFLE_DISABLED;
  delete process.env.TREASURY_EVM_SIGNER_PRIVATE_KEY;
  delete process.env.TREASURY_SOLANA_SIGNER_SECRET_KEY;
});

const FRIDAY = Date.UTC(2026, 9, 9, 16, 15, 0);
const WINDOW = "2026-10-09";

function ensureCreatorWallet(creatorId: string) {
  const engine = getMemoryEngine();
  const c = engine.state.creators.get(creatorId);
  expect(c, creatorId).toBeTruthy();
  if (!c) return;
  if (!c.wallets.length) {
    c.wallets.push({
      chain: "evm",
      address: `0x${creatorId.replace(/[^a-f0-9]/gi, "a").slice(0, 40).padEnd(40, "a")}`,
      network: "ethereum",
    });
  }
  // Activity inside profit window (2026-10-02 → 2026-10-09)
  for (const listing of engine.state.listings.values()) {
    if (listing.creatorId !== creatorId) continue;
    listing.createdAt = Date.UTC(2026, 9, 5, 12, 0, 0);
    listing.softLaunchedAt = listing.createdAt;
    if (listing.stage === "draft") listing.stage = "soft_launch";
    listing.mintTxHash = listing.mintTxHash || `0xmint-${listing.id}`;
  }
}

describe("friday raffle eligibility + draw", () => {
  it("keeps slim eligibility + banner marketing copy", () => {
    expect(TREASURY_FRIDAY_COPY.bannerTitle).toMatch(/raffle/i);
    expect(TREASURY_FRIDAY_COPY.eligibility).toMatch(/mint/i);
    expect(TREASURY_FRIDAY_COPY.bannerHref).toContain("/treasury");
  });

  it("picks a deterministic winner and excludes the listing seller", () => {
    const engine = getMemoryEngine();
    for (const id of engine.state.creators.keys()) {
      ensureCreatorWallet(id);
    }
    // Give a collector a purchase in-window
    const collectorId = [...engine.state.creators.keys()].find(
      (id) => !engine.state.listings.get("listing-fresh-1")?.creatorId.includes(id),
    );
    const buyer =
      collectorId &&
      collectorId !== engine.state.listings.get("listing-fresh-1")?.creatorId
        ? collectorId
        : [...engine.state.creators.keys()][1];
    expect(buyer).toBeTruthy();
    ensureCreatorWallet(buyer!);
    recordMemoryPurchase({
      listingId: "listing-nova-1",
      buyerId: buyer!,
      amountUsd: 25,
      soldAt: Date.UTC(2026, 9, 6, 12, 0, 0),
      status: "completed",
      feeTreasuryUsd: 0.125,
      chain: "evm",
      txHash: null,
    });

    return collectFridayRaffleEligible({
      windowId: WINDOW,
      now: FRIDAY,
      memory: true,
    }).then((eligible) => {
      expect(eligible.length).toBeGreaterThan(0);
      const seller = engine.state.listings.get("listing-fresh-1")!.creatorId;
      const winner = pickFridayRaffleWinner(
        WINDOW,
        eligible,
        new Set([seller]),
      );
      expect(winner).toBeTruthy();
      expect(winner!.userId).not.toBe(seller);
      const expected = [...eligible]
        .filter((e) => e.userId !== seller)
        .sort((a, b) =>
          raffleSortKey(WINDOW, a.userId).localeCompare(
            raffleSortKey(WINDOW, b.userId),
          ),
        )[0];
      expect(winner!.userId).toBe(expected.userId);
    });
  });
});

describe("friday buy integrates raffle", () => {
  it("draws a raffle when the Friday buy queues with profit", async () => {
    const engine = getMemoryEngine();
    const listing = engine.state.listings.get("listing-fresh-1");
    expect(listing).toBeTruthy();
    listing!.tokenId = "1";
    listing!.contractAddress = "0x1111111111111111111111111111111111111111";
    listing!.mintTxHash = "0xmintfresh1";
    listing!.delisted = false;
    listing!.stage = "soft_launch";
    listing!.priceUsd = 20;
    listing!.saleMode = "fixed";
    listing!.type = "single";
    listing!.createdAt = Date.UTC(2026, 9, 5, 12, 0, 0);
    listing!.softLaunchedAt = listing!.createdAt;

    for (const id of engine.state.creators.keys()) {
      ensureCreatorWallet(id);
    }

    const result = await runFridayTreasuryBuys({
      now: FRIDAY,
      skipBalanceFetch: true,
      weekProfitUsd: 80,
      balances: { ethereum: 10n ** 18n, solana: 10n ** 9n, boing: 10n ** 18n },
    });
    expect(result.status).toBe("queued");
    expect(result.raffle).toBeTruthy();
    expect(result.raffle!.status).toBe("drawn");
    expect(result.raffle!.winnerUserId).toBeTruthy();
    expect(result.raffle!.eligibleCount).toBeGreaterThan(0);
  });

  it("skips raffle draw when profit is zero", async () => {
    const result = await runFridayTreasuryBuys({
      now: FRIDAY,
      skipBalanceFetch: true,
      weekProfitUsd: 0,
      balances: { ethereum: 10n ** 18n },
    });
    expect(result.status).toBe("skipped_no_profit");
    expect(result.raffle?.status).toBe("skipped_no_profit");
  });

  it("records a durable claim for the winner", async () => {
    const engine = getMemoryEngine();
    for (const id of engine.state.creators.keys()) ensureCreatorWallet(id);
    const listing = engine.state.listings.get("listing-fresh-1")!;
    listing.createdAt = Date.UTC(2026, 9, 5, 12, 0, 0);
    listing.softLaunchedAt = listing.createdAt;
    listing.stage = "soft_launch";
    listing.mintTxHash = "0xmint";

    const eligible = await collectFridayRaffleEligible({
      windowId: WINDOW,
      now: FRIDAY,
      memory: true,
    });
    const winner = pickFridayRaffleWinner(
      WINDOW,
      eligible,
      new Set([listing.creatorId]),
    );
    expect(winner).toBeTruthy();

    const raffle = await runFridayTreasuryRaffle({
      windowId: WINDOW,
      memory: true,
      fridayBuyId: "buy-1",
      buyStatus: "queued",
      listingId: listing.id,
      purchaseId: null,
      listing,
      weekProfitUsd: 40,
      now: FRIDAY,
    });
    expect(raffle.status).toBe("drawn");
    expect(raffle.winnerUserId).toBe(winner!.userId);

    const wallet = engine.state.creators.get(winner!.userId)!.wallets[0]!;
    const claimed = await claimFridayRafflePrize({
      windowId: WINDOW,
      userId: winner!.userId,
      claimAddress: wallet.address,
    });
    expect(claimed.ok).toBe(true);
    if (claimed.ok) {
      expect(claimed.raffle.prizeStatus).toBe("claimed");
      expect(claimed.raffle.claimAddress).toBe(wallet.address);
    }
  });
});
