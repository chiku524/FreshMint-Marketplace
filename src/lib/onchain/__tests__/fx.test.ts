import { afterEach, describe, expect, it } from "vitest";
import {
  quoteNativeFromUsd,
  quotePayInFromUsdAt,
  resetLiveRatesForTests,
} from "@/lib/onchain/fx";

describe("native quotes", () => {
  const previous = {
    ETH: process.env.NEXT_PUBLIC_USD_PER_ETH,
    SOL: process.env.NEXT_PUBLIC_USD_PER_SOL,
  };

  afterEach(() => {
    if (previous.ETH === undefined) delete process.env.NEXT_PUBLIC_USD_PER_ETH;
    else process.env.NEXT_PUBLIC_USD_PER_ETH = previous.ETH;
    if (previous.SOL === undefined) delete process.env.NEXT_PUBLIC_USD_PER_SOL;
    else process.env.NEXT_PUBLIC_USD_PER_SOL = previous.SOL;
    resetLiveRatesForTests();
  });

  it("converts a $25 Solana listing into lamports at the SOL rate", () => {
    process.env.NEXT_PUBLIC_USD_PER_SOL = "150";
    const quote = quoteNativeFromUsd(25, "solana");
    expect(quote.symbol).toBe("SOL");
    expect(quote.usdPerNative).toBe(150);
    expect(quote.amount).toBeCloseTo(25 / 150, 8);
    expect(quote.baseUnits).toBe(BigInt(166666667));
    expect(quote.formatted).toContain("SOL");
  });

  it("does not use the old USD * 1e6 lamport shortcut", () => {
    process.env.NEXT_PUBLIC_USD_PER_SOL = "150";
    const quote = quoteNativeFromUsd(25, "solana");
    expect(Number(quote.baseUnits)).not.toBe(25_000_000);
  });

  it("converts an EVM listing into wei at the ETH rate", () => {
    process.env.NEXT_PUBLIC_USD_PER_ETH = "3000";
    const quote = quoteNativeFromUsd(45, "evm");
    expect(quote.symbol).toBe("ETH");
    expect(quote.amount).toBeCloseTo(0.015, 8);
    expect(quote.baseUnits).toBe(BigInt("15000000000000000"));
  });

  it("prefers a live SOL spot over the env fallback", () => {
    process.env.NEXT_PUBLIC_USD_PER_SOL = "150";
    const quote = quoteNativeFromUsd(25, "solana", { SOL: 200 });
    expect(quote.source).toBe("live");
    expect(quote.usdPerNative).toBe(200);
    expect(quote.amount).toBeCloseTo(0.125, 8);
  });

  it("quotes ETH to pay for a Solana listing at the same USD", async () => {
    process.env.NEXT_PUBLIC_USD_PER_SOL = "150";
    process.env.NEXT_PUBLIC_USD_PER_ETH = "3000";
    const priced = quotePayInFromUsdAt({
      amountUsd: 25,
      listingChain: "solana",
      payNetwork: "ethereum",
    });
    expect(priced.bridged).toBe(true);
    expect(priced.settle.symbol).toBe("SOL");
    expect(priced.pay.symbol).toBe("ETH");
    expect(priced.pay.amount).toBeCloseTo(25 / 3000, 8);
  });
});
