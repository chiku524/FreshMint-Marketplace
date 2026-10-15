import { describe, expect, it } from "vitest";
import {
  NFT_MARKETPLACE_SALE_SERVICES,
  PLATFORM_FEE_BPS,
  PLATFORM_FEE_PERCENT,
  splitSaleProceeds,
} from "@/lib/fees/platform";

describe("platform fees", () => {
  it("splits 0.5% to the treasury and the rest to the seller", () => {
    const split = splitSaleProceeds(100);
    expect(PLATFORM_FEE_BPS.total).toBe(50);
    expect(PLATFORM_FEE_PERCENT.total).toBe(0.5);
    expect(split.feeTreasuryUsd).toBe(0.5);
    expect(split.feeOperatorUsd).toBe(0);
    expect(split.feeTotalUsd).toBe(0.5);
    expect(split.sellerNetUsd).toBe(99.5);
  });

  it("applies the same 0.5% treasury cut to every NFT marketplace sale service", () => {
    expect(NFT_MARKETPLACE_SALE_SERVICES).toEqual([
      "buy_now",
      "timed_listing",
      "english_auction",
      "dutch_auction",
      "offer_accept",
      "collection_package",
      "resale",
    ]);
    for (const _service of NFT_MARKETPLACE_SALE_SERVICES) {
      const split = splitSaleProceeds(200);
      expect(split.treasuryBps).toBe(50);
      expect(split.feeTreasuryUsd).toBe(1);
    }
  });

  it("rounds to cents without exceeding the sale", () => {
    const split = splitSaleProceeds(33.33);
    expect(split.feeTotalUsd).toBeCloseTo(
      split.feeTreasuryUsd + split.feeOperatorUsd,
      2,
    );
    expect(split.sellerNetUsd + split.feeTotalUsd).toBeCloseTo(33.33, 2);
    expect(split.sellerNetUsd).toBeLessThanOrEqual(33.33);
  });
});
