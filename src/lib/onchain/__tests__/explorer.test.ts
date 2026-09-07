import { describe, expect, it } from "vitest";
import {
  isExplorableTxHash,
  shortTxHash,
  txExplorerUrl,
} from "@/lib/onchain/explorer";

describe("tx explorer helpers", () => {
  it("skips simulated / platform hashes", () => {
    expect(isExplorableTxHash("sim-pay:abc")).toBe(false);
    expect(isExplorableTxHash("platform:legacy")).toBe(false);
    expect(isExplorableTxHash("pending:x")).toBe(false);
    expect(
      isExplorableTxHash(
        "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      ),
    ).toBe(true);
  });

  it("builds network explorer urls", () => {
    const hash =
      "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    expect(txExplorerUrl({ hash, network: "ethereum" })).toContain("/tx/");
    expect(txExplorerUrl({ hash, network: "solana" })).toContain(
      "explorer.solana.com/tx/",
    );
    expect(txExplorerUrl({ hash: "sim-pay:1", network: "ethereum" })).toBeNull();
    expect(shortTxHash(hash)).toMatch(/…$/);
  });
});
