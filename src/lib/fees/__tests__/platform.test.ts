import { describe, expect, it } from "vitest";
import { PLATFORM_FEE_BPS, splitSaleProceeds } from "@/lib/fees/platform";

describe("platform fees", () => {
  it("splits 3% to the treasury and the rest to the seller", () => {
    const split = splitSaleProceeds(100);
    expect(PLATFORM_FEE_BPS.total).toBe(300);
    expect(split.feeTreasuryUsd).toBe(3);
    expect(split.feeOperatorUsd).toBe(0);
    expect(split.feeTotalUsd).toBe(3);
    expect(split.sellerNetUsd).toBe(97);
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
