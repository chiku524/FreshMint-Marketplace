import { describe, expect, it } from "vitest";
import { PLATFORM_FEE_BPS, splitSaleProceeds } from "@/lib/fees/platform";

describe("platform fees", () => {
  it("splits 2.5% as 1.5% treasury + 1% operator", () => {
    const split = splitSaleProceeds(100);
    expect(PLATFORM_FEE_BPS.total).toBe(250);
    expect(split.feeTreasuryUsd).toBe(1.5);
    expect(split.feeOperatorUsd).toBe(1);
    expect(split.feeTotalUsd).toBe(2.5);
    expect(split.sellerNetUsd).toBe(97.5);
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
