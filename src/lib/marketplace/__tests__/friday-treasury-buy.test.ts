import { beforeEach, describe, expect, it } from "vitest";
import {
  enableMemoryMode,
  getMemoryEngine,
  resetMemoryStoreForTests,
} from "@/lib/data/memory-store";
import {
  applyFridayBudgetCeiling,
  fridayBudgetCeilingUsd,
  fridayProfitWindowMs,
  listingFairSortKey,
  nativeNeededForFridayBuy,
  runFridayTreasuryBuys,
  selectFridayTreasuryCandidate,
  utcFridayWindowId,
} from "@/lib/marketplace/friday-treasury-buy";
import { TREASURY_FRIDAY_COPY } from "@/lib/marketplace/friday-treasury-copy";
import type { Listing } from "@/lib/discovery/types";

beforeEach(() => {
  resetMemoryStoreForTests();
  enableMemoryMode("unit-test");
  process.env.NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS =
    "0xDde8Ec0A27467a8Eb6E7a3245e07d2D67B6B56bb";
  process.env.NEXT_PUBLIC_PLATFORM_TREASURY_SOLANA =
    "3u2DbBkCqoSQmcreHfwQWDekJ8HPctgns3v6L3LdupwW";
  delete process.env.TREASURY_FRIDAY_BUDGET_USD;
  delete process.env.TREASURY_EVM_SIGNER_PRIVATE_KEY;
  delete process.env.TREASURY_SOLANA_SIGNER_SECRET_KEY;
});

/** 2026-10-09 is a Friday. */
const FRIDAY = Date.UTC(2026, 9, 9, 16, 15, 0);
const THURSDAY = Date.UTC(2026, 9, 8, 16, 15, 0);

function mint(listingId: string) {
  const listing = getMemoryEngine().state.listings.get(listingId);
  expect(listing, listingId).toBeTruthy();
  if (!listing) return listing;
  listing.tokenId = listing.tokenId || "1";
  listing.contractAddress =
    listing.contractAddress || "0x1111111111111111111111111111111111111111";
  listing.mintTxHash = listing.mintTxHash || `0xmint${listingId.slice(-8)}`;
  listing.delisted = false;
  listing.stage = listing.stage === "draft" ? "soft_launch" : listing.stage;
  listing.priceUsd = listing.priceUsd && listing.priceUsd > 0 ? listing.priceUsd : 20;
  listing.saleMode = "fixed";
  listing.type = "single";
  return listing;
}

describe("friday treasury window + copy", () => {
  it("identifies UTC Fridays and skips other weekdays unless forced", () => {
    expect(utcFridayWindowId(FRIDAY)).toBe("2026-10-09");
    expect(utcFridayWindowId(THURSDAY)).toBeNull();
    expect(utcFridayWindowId(THURSDAY, true)).toBe("2026-10-02");
  });

  it("uses weekly profit as the spend cap (optional env is a ceiling only)", () => {
    expect(fridayBudgetCeilingUsd()).toBeNull();
    expect(applyFridayBudgetCeiling(12.34)).toBe(12.34);
    expect(applyFridayBudgetCeiling(0)).toBe(0);
    process.env.TREASURY_FRIDAY_BUDGET_USD = "10";
    expect(applyFridayBudgetCeiling(12.34)).toBe(10);
  });

  it("keeps Friday copy in the existing product voice", () => {
    expect(TREASURY_FRIDAY_COPY.home).toMatch(/Every Friday/i);
    expect(TREASURY_FRIDAY_COPY.home).toMatch(/last week/i);
    expect(TREASURY_FRIDAY_COPY.docs).not.toMatch(/\$50/);
    expect(TREASURY_FRIDAY_COPY.open).toMatch(/Fridays/);
  });
});

describe("friday listing selection", () => {
  it("picks a fair hashed Open Lane 1/1 and skips auctions, drafts, treasury wallets", () => {
    const engine = getMemoryEngine();
    const a = mint("listing-fresh-1") as Listing;
    const b = mint("listing-nova-1") as Listing;
    if (!a || !b) return;
    a.priceUsd = 20;
    b.priceUsd = 30;

    const auction = engine.state.listings.get("listing-nova-auction");
    expect(auction).toBeTruthy();

    const picked = selectFridayTreasuryCandidate({
      listings: engine.state.listings.values(),
      creators: engine.state.creators,
      soldIds: new Set(),
      windowId: "2026-10-09",
      budgetUsd: 50,
      treasuryAddrs: new Set([
        "0xDde8Ec0A27467a8Eb6E7a3245e07d2D67B6B56bb".toLowerCase(),
      ]),
      nativeBalance: () => 10n ** 18n,
      now: FRIDAY,
    });
    expect(picked.reason).toBe("ok");
    expect(picked.candidate).toBeTruthy();
    expect(picked.candidate?.listing.id).not.toBe("listing-nova-auction");
    const expectedFirst = [a.id, b.id].sort((x, y) =>
      listingFairSortKey("2026-10-09", x).localeCompare(
        listingFairSortKey("2026-10-09", y),
      ),
    )[0];
    expect(picked.candidate?.listing.id).toBe(expectedFirst);
  });

  it("reports no_funds when every eligible work exceeds native balance", () => {
    mint("listing-fresh-1");
    const picked = selectFridayTreasuryCandidate({
      listings: getMemoryEngine().state.listings.values(),
      creators: getMemoryEngine().state.creators,
      soldIds: new Set(),
      windowId: "2026-10-09",
      budgetUsd: 50,
      treasuryAddrs: new Set(),
      nativeBalance: () => 0n,
      now: FRIDAY,
    });
    expect(picked.candidate).toBeNull();
    expect(picked.reason).toBe("no_funds");
  });
});

describe("runFridayTreasuryBuys (memory)", () => {
  it("no-ops off Friday", async () => {
    const result = await runFridayTreasuryBuys({
      now: THURSDAY,
      skipBalanceFetch: true,
      balances: { ethereum: 10n ** 18n },
    });
    expect(result.status).toBe("skipped_not_friday");
  });

  it("queues a Friday intent without a treasury signer and is idempotent", async () => {
    mint("listing-fresh-1");
    const first = await runFridayTreasuryBuys({
      now: FRIDAY,
      skipBalanceFetch: true,
      weekProfitUsd: 80,
      balances: { ethereum: 10n ** 18n, solana: 10n ** 9n, boing: 10n ** 18n },
    });
    expect(first.alreadyRan).toBe(false);
    expect(first.status).toBe("queued");
    expect(first.listingId).toBeTruthy();
    expect(first.signerAvailable).toBe(false);
    expect(first.weekProfitUsd).toBe(80);
    expect(first.reason).toMatch(/no_treasury_signer/i);

    const second = await runFridayTreasuryBuys({
      now: FRIDAY,
      skipBalanceFetch: true,
      weekProfitUsd: 80,
      balances: { ethereum: 10n ** 18n },
    });
    expect(second.alreadyRan).toBe(true);
    expect(second.windowId).toBe(first.windowId);
    expect(second.listingId).toBe(first.listingId);
  });

  it("skips when the treasury cannot cover any listing", async () => {
    mint("listing-fresh-1");
    const result = await runFridayTreasuryBuys({
      now: FRIDAY,
      skipBalanceFetch: true,
      weekProfitUsd: 80,
      balances: { ethereum: 0n, solana: 0n, boing: 0n },
    });
    expect(result.status).toBe("skipped_no_funds");
  });

  it("skips when that week's treasury profit is zero", async () => {
    mint("listing-fresh-1");
    const result = await runFridayTreasuryBuys({
      now: FRIDAY,
      skipBalanceFetch: true,
      weekProfitUsd: 0,
      balances: { ethereum: 10n ** 18n },
    });
    expect(result.status).toBe("skipped_no_profit");
  });
});

describe("friday native quote", () => {
  it("quotes purchase + gas reserve on Ethereum and Solana", () => {
    const eth = nativeNeededForFridayBuy({
      amountUsd: 30,
      chain: "evm",
      network: "ethereum",
    });
    expect(eth.symbol).toBe("ETH");
    expect(eth.gasReserve).toBe(1_000_000_000_000_000n);
    expect(eth.total).toBe(eth.purchase + eth.gasReserve);

    const sol = nativeNeededForFridayBuy({
      amountUsd: 30,
      chain: "solana",
      network: "solana",
    });
    expect(sol.symbol).toBe("SOL");
    expect(sol.gasReserve).toBe(1_000_000n);
  });

  it("spans previous Friday 00:00 through this Friday", () => {
    const w = fridayProfitWindowMs("2026-10-09", FRIDAY);
    expect(new Date(w.startMs).toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(w.endMs).toBe(FRIDAY);
  });
});
