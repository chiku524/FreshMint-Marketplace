import { describe, expect, it } from "vitest";
import { describeInterruptedUpload, gasTokenFor, mintGasExpectation } from "./mint-expectations";

describe("mint expectations", () => {
  it("maps gas tokens", () => {
    expect(gasTokenFor("solana-devnet")).toBe("SOL");
    expect(gasTokenFor("ethereum")).toBe("ETH");
    expect(gasTokenFor("boing")).toBe("BOING");
  });
  it("explains batches and testnets", () => {
    const s = mintGasExpectation("ethereum-sepolia", 10_000);
    expect(s).toMatch(/one signature per batch/);
    expect(s).toMatch(/free test ETH/);
  });
  it("describes an interrupted upload only when recent", () => {
    expect(describeInterruptedUpload({ total: 10000, startedAt: 0 }, 1000)).toMatch(/10,000 files/);
    expect(describeInterruptedUpload({ total: 5, startedAt: 0 }, 2 * 86_400_000)).toBeNull();
    expect(describeInterruptedUpload(null, 0)).toBeNull();
  });
});