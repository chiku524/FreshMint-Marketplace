import { describe, expect, it } from "vitest";
import {
  LINKED_NFT_TOKEN_SCHEMA,
  normalizeTokenAddress,
  parseLinkedTokensJson,
  serializeLinkedTokens,
  shortTokenAddress,
  validateLinkedTokensInput,
} from "@/lib/marketplace/linked-tokens";

const EVM = "0x0000000000000000000000000000000000000001";
const BOING =
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("linked-tokens", () => {
  it("parses and serializes JSON round-trip", () => {
    const json = serializeLinkedTokens([
      { address: EVM.toLowerCase(), label: "PROJ", chain: null },
      { address: BOING, label: null, chain: "boing" },
    ]);
    const parsed = parseLinkedTokensJson(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.label).toBe("PROJ");
    expect(parsed[1]?.chain).toBe("boing");
  });

  it("validates EVM addresses and dedupes case-insensitively", () => {
    const ok = validateLinkedTokensInput(
      [
        { address: EVM, label: "A" },
        { address: EVM.toLowerCase(), label: "B" },
      ],
      "evm",
    );
    expect(ok.ok).toBe(false);
    if (ok.ok) return;
    expect(ok.issues).toContain("duplicate_address");
  });

  it("accepts many tokens with no cap", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      address: `0x${(i + 1).toString(16).padStart(40, "0")}`,
      label: `T${i}`,
    }));
    const ok = validateLinkedTokensInput(many, "evm");
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.tokens).toHaveLength(40);
  });

  it("normalizes Boing AccountIds", () => {
    expect(normalizeTokenAddress(BOING.toUpperCase(), "boing")).toBe(
      BOING.toLowerCase(),
    );
    expect(normalizeTokenAddress("0xdead", "boing")).toBeNull();
  });

  it("rejects invalid shapes", () => {
    expect(validateLinkedTokensInput({}, "evm").ok).toBe(false);
    expect(
      validateLinkedTokensInput([{ address: "not-an-address" }], "evm").ok,
    ).toBe(false);
  });

  it("shortens addresses for chips", () => {
    expect(shortTokenAddress(EVM).includes("…")).toBe(true);
  });

  it("documents the legacy schema constant (non-authoritative)", () => {
    expect(LINKED_NFT_TOKEN_SCHEMA).toBe("boing.linked_nft_token.v1");
  });
});

describe("linked-token-registry", () => {
  it("marks non-Boing chains unsupported", async () => {
    const { collectionSupportsOnchainLinkedTokens, readLinkedTokensFromRegistry } =
      await import("@/lib/marketplace/linked-token-registry");
    expect(collectionSupportsOnchainLinkedTokens("evm")).toBe(false);
    const read = await readLinkedTokensFromRegistry({
      chain: "solana",
      collectionAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error).toBe("registry_boing_only");
  });

  it("returns registry_sdk_pending without SDK module env", async () => {
    const prev = process.env.BOING_SDK_REGISTRY_MODULE;
    const prevReg = process.env.NEXT_PUBLIC_BOING_LINKED_NFT_TOKEN_REGISTRY;
    delete process.env.BOING_SDK_REGISTRY_MODULE;
    process.env.NEXT_PUBLIC_BOING_LINKED_NFT_TOKEN_REGISTRY = `0x${"ab".repeat(32)}`;
    const { planLinkedTokenRegistryWrite } = await import(
      "@/lib/marketplace/linked-token-registry"
    );
    const plan = await planLinkedTokenRegistryWrite({
      chain: "boing",
      collectionAddress: `0x${"cd".repeat(32)}`,
      creatorAddress: `0x${"ef".repeat(32)}`,
      desiredTokens: [{ address: `0x${"11".repeat(32)}` }],
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toBe("registry_sdk_pending");
    if (prev) process.env.BOING_SDK_REGISTRY_MODULE = prev;
    else delete process.env.BOING_SDK_REGISTRY_MODULE;
    if (prevReg) process.env.NEXT_PUBLIC_BOING_LINKED_NFT_TOKEN_REGISTRY = prevReg;
    else delete process.env.NEXT_PUBLIC_BOING_LINKED_NFT_TOKEN_REGISTRY;
  });
});
