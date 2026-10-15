import { describe, expect, it } from "vitest";
import {
  buildTreasuryActivity,
  formatTreasuryAddress,
} from "@/lib/marketplace/treasury-public";
import type { FridayTreasuryBuyRecord } from "@/lib/marketplace/friday-treasury-buy";
import type { FridayRaffleRecord } from "@/lib/marketplace/friday-treasury-raffle";

describe("treasury-public", () => {
  it("shortens addresses for display", () => {
    expect(formatTreasuryAddress(null)).toBe("—");
    expect(formatTreasuryAddress("0x1234567890abcdef")).toMatch(/…/);
  });

  it("merges buys, raffles, fees, and boosts by time", () => {
    const buys: FridayTreasuryBuyRecord[] = [
      {
        id: "b1",
        windowId: "2026-10-03",
        status: "purchased",
        listingId: "l1",
        purchaseId: "p1",
        amountUsd: 40,
        chain: "evm",
        network: "ethereum",
        reason: "ok",
        paymentTxHash: "0xbuy",
        createdAt: 1_000,
      },
    ];
    const raffles: FridayRaffleRecord[] = [
      {
        id: "r1",
        windowId: "2026-10-03",
        status: "drawn",
        fridayBuyId: "b1",
        listingId: "l1",
        purchaseId: "p1",
        winnerUserId: "u1",
        eligibleCount: 4,
        prizeStatus: "pending_claim",
        claimAddress: null,
        claimTxHash: null,
        claimedAt: null,
        winnerKinds: ["bought"],
        reason: "ok",
        createdAt: 2_000,
      },
    ];
    const items = buildTreasuryActivity({
      buys,
      raffles,
      fees: [
        {
          id: "f1",
          feeTreasuryUsd: 0.5,
          amountUsd: 100,
          listingId: "l2",
          createdAt: 3_000,
          paymentTxHash: null,
          payNetwork: "base",
        },
      ],
      boosts: [
        {
          id: "l3",
          title: "Glow",
          featuredBoostedAt: 500,
        },
      ],
    });

    expect(items.map((i) => i.kind)).toEqual([
      "fee",
      "raffle",
      "friday_buy",
      "featured_boost",
    ]);
    expect(items[1].label).toBe("Raffle claim");
    expect(items[2].href).toBe("/listings/l1");
    expect(items[3].amountUsd).toBe(15);
  });
});
