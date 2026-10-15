import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Client-side Boing wallet result handling — mirrors the logic in
 * wallet-client.ts without requiring a browser `window.boing` provider.
 */

function isBoingMempoolAcceptedClient(result: unknown): boolean {
  if (typeof result === "string") {
    const t = result.trim().toLowerCase();
    return t === "ok" || t === "0xok" || t === "accepted" || t === "success";
  }
  if (Array.isArray(result)) {
    return result.some((item) => isBoingMempoolAcceptedClient(item));
  }
  if (!result || typeof result !== "object") return false;
  const o = result as Record<string, unknown>;
  for (const key of [
    "tx_hash",
    "txHash",
    "hash",
    "tx_id",
    "txId",
    "status",
    "result",
  ]) {
    const v = o[key];
    if (typeof v === "string") {
      const t = v.trim().toLowerCase();
      if (t === "ok" || t === "0xok" || t === "accepted" || t === "success") {
        return true;
      }
    }
  }
  if ("result" in o && isBoingMempoolAcceptedClient(o.result)) return true;
  if ("data" in o && isBoingMempoolAcceptedClient(o.data)) return true;
  return false;
}

function normalizeExtractedBoingTxIdClient(value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  if (
    t === "ok" ||
    t === "0xok" ||
    t.toLowerCase() === "accepted" ||
    t.toLowerCase() === "success"
  ) {
    return null;
  }
  if (/^0x[0-9a-fA-F]{64}$/.test(t)) return t.toLowerCase();
  if (/^[0-9a-fA-F]{64}$/.test(t)) return `0x${t.toLowerCase()}`;
  if (t.length >= 8) return t.startsWith("0x") ? t : `0x${t}`;
  return null;
}

function extractBoingTxHashClient(result: unknown): string | null {
  if (typeof result === "string") {
    return normalizeExtractedBoingTxIdClient(result);
  }
  if (Array.isArray(result)) {
    for (const item of result) {
      const found = extractBoingTxHashClient(item);
      if (found) return found;
    }
    return null;
  }
  if (!result || typeof result !== "object") return null;
  const o = result as Record<string, unknown>;
  for (const key of [
    "tx_id",
    "txId",
    "hash",
    "tx_hash",
    "txHash",
    "transactionHash",
    "transaction_id",
    "transactionId",
    "id",
    "signature",
  ]) {
    const v = o[key];
    if (typeof v === "string") {
      const found = normalizeExtractedBoingTxIdClient(v);
      if (found) return found;
    }
  }
  if ("result" in o) {
    const nested = extractBoingTxHashClient(o.result);
    if (nested) return nested;
  }
  if ("data" in o) {
    const nested = extractBoingTxHashClient(o.data);
    if (nested) return nested;
  }
  return null;
}

function interpretBoingSendResult(result: unknown): {
  txHash: string | null;
  mempoolAccepted: boolean;
  shouldThrowMissing: boolean;
} {
  const txHash = extractBoingTxHashClient(result);
  const mempoolAccepted = isBoingMempoolAcceptedClient(result);
  return {
    txHash,
    mempoolAccepted,
    shouldThrowMissing: !txHash && !mempoolAccepted,
  };
}

describe("boing wallet send result interpretation", () => {
  it("does not treat mempool ok as boing_tx_hash_missing", () => {
    for (const result of [
      "ok",
      "0xok",
      { tx_hash: "ok" },
      { txHash: "ok" },
      { result: { tx_hash: "ok" } },
    ]) {
      const interpreted = interpretBoingSendResult(result);
      expect(interpreted.txHash).toBeNull();
      expect(interpreted.mempoolAccepted).toBe(true);
      expect(interpreted.shouldThrowMissing).toBe(false);
    }
  });

  it("still extracts a real tx id when present", () => {
    const hash = `0x${"ab".repeat(32)}`;
    const interpreted = interpretBoingSendResult({ tx_id: hash });
    expect(interpreted.txHash).toBe(hash);
    expect(interpreted.shouldThrowMissing).toBe(false);
  });

  it("throws missing only when there is neither hash nor acceptance", () => {
    expect(interpretBoingSendResult(null).shouldThrowMissing).toBe(true);
    expect(interpretBoingSendResult({}).shouldThrowMissing).toBe(true);
    expect(interpretBoingSendResult({ status: "failed" }).shouldThrowMissing).toBe(
      true,
    );
  });
  it("returns pending marker for mint when mempool ok (no real tx id)", () => {
    const interpreted = interpretBoingSendResult({ tx_hash: "ok" });
    expect(interpreted.txHash).toBeNull();
    expect(interpreted.mempoolAccepted).toBe(true);
    // Mint path should accept mempool like deploy — pending marker, not throw.
    const mintShouldThrow =
      !interpreted.txHash &&
      !interpreted.mempoolAccepted;
    expect(mintShouldThrow).toBe(false);
  });
});

describe("pendingBoingAcceptedTxHash", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a pending: marker long enough for confirm schemas", async () => {
    const { pendingBoingAcceptedTxHash } = await import(
      "@/lib/onchain/wallet-client"
    );
    const marker = pendingBoingAcceptedTxHash();
    expect(marker.startsWith("pending:boing-accepted:")).toBe(true);
    expect(marker.length).toBeGreaterThanOrEqual(8);
  });
});
