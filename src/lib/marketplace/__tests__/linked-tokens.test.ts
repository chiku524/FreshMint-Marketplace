import { describe, expect, it } from "vitest";
import {
  LINKED_NFT_TOKEN_SCHEMA,
  normalizeTokenAddress,
  parseLinkedTokensJson,
  serializeLinkedTokens,
  shortTokenAddress,
  validateLinkedTokensInput,
} from "@/lib/marketplace/linked-tokens";
import {
  SELECTOR_LINKED_NFT_TOKEN_CLAIM_ASSET,
  SELECTOR_LINKED_NFT_TOKEN_REGISTER_LINK,
  SELECTOR_LINKED_NFT_TOKEN_UNLINK_AT,
  buildLinkedNftTokenRegisterFlowTxs,
  buildLinkedNftTokenUnlinkAtTx,
  decodeLinkedNftTokenGetLinkAtReturnData,
  decodeLinkedNftTokenLinksCountReturnData,
  encodeLinkedNftTokenClaimAssetCalldataHex,
  encodeLinkedNftTokenGetLinkAtCalldataHex,
  encodeLinkedNftTokenRegisterLinkCalldataHex,
  encodeLinkedNftTokenUnlinkAtCalldataHex,
} from "@/lib/onchain/linked-nft-token-registry";
import { mergeLinkedTokenLabels } from "@/lib/marketplace/linked-token-registry";

const EVM = "0x0000000000000000000000000000000000000001";
const BOING =
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const A = `0x${"11".repeat(32)}`;
const B = `0x${"22".repeat(32)}`;
const SENDER = `0x${"aa".repeat(32)}`;
const REG = `0x${"bb".repeat(32)}`;

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

describe("linked-nft-token-registry helpers (SDK abf8808)", () => {
  it("encodes claim / register / unlink lengths and selectors", () => {
    const claim = encodeLinkedNftTokenClaimAssetCalldataHex(A);
    expect(claim.length).toBe(2 + 64 * 2);
    // selector is last byte of first 32-byte word
    expect(claim.slice(2, 66).endsWith("e0")).toBe(true);
    expect(SELECTOR_LINKED_NFT_TOKEN_CLAIM_ASSET).toBe(0xe0);

    const reg = encodeLinkedNftTokenRegisterLinkCalldataHex(A, B);
    expect(reg.length).toBe(2 + 96 * 2);
    expect(reg.slice(2, 66).endsWith("e1")).toBe(true);
    expect(SELECTOR_LINKED_NFT_TOKEN_REGISTER_LINK).toBe(0xe1);

    const un = encodeLinkedNftTokenUnlinkAtCalldataHex(3);
    expect(un.length).toBe(2 + 64 * 2);
    expect(un.slice(2, 66).endsWith("e2")).toBe(true);
    expect(SELECTOR_LINKED_NFT_TOKEN_UNLINK_AT).toBe(0xe2);

    expect(encodeLinkedNftTokenGetLinkAtCalldataHex(0).length).toBe(2 + 64 * 2);
  });

  it("builds claim×2 + register flow txs", () => {
    const txs = buildLinkedNftTokenRegisterFlowTxs({
      senderHex32: SENDER,
      registryHex32: REG,
      collectionHex32: A,
      tokenHex32: B,
    });
    expect(txs).toHaveLength(3);
    expect(txs.every((t) => t.type === "contract_call")).toBe(true);
    expect(txs[0]!.contract).toBe(REG);
    expect(txs[0]!.calldata.length).toBe(2 + 64 * 2);
    expect(txs[2]!.calldata.length).toBe(2 + 96 * 2);
  });

  it("builds unlink_at contract_call", () => {
    const tx = buildLinkedNftTokenUnlinkAtTx({
      senderHex32: SENDER,
      registryHex32: REG,
      index: 7,
    });
    expect(tx.type).toBe("contract_call");
    expect(tx.calldata.slice(2, 66).endsWith("e2")).toBe(true);
  });

  it("decodes links_count and get_link_at return data", () => {
    const countWord = "0x" + "00".repeat(31) + "03";
    expect(decodeLinkedNftTokenLinksCountReturnData(countWord)).toBe(3n);

    const pair = A.slice(2) + B.slice(2);
    const decoded = decodeLinkedNftTokenGetLinkAtReturnData(`0x${pair}`);
    expect(decoded.collectionHex.toLowerCase()).toBe(A);
    expect(decoded.tokenHex.toLowerCase()).toBe(B);
    expect(decoded.active).toBe(true);

    const tomb = decodeLinkedNftTokenGetLinkAtReturnData("0x" + "0".repeat(128));
    expect(tomb.active).toBe(false);
  });
});

describe("linked-token-registry adapter", () => {
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

  it("returns registry_address_unset without env", async () => {
    const prevReg = process.env.NEXT_PUBLIC_BOING_LINKED_NFT_TOKEN_REGISTRY;
    delete process.env.NEXT_PUBLIC_BOING_LINKED_NFT_TOKEN_REGISTRY;
    delete process.env.BOING_LINKED_NFT_TOKEN_REGISTRY;
    const { planLinkedTokenRegistryWrite } = await import(
      "@/lib/marketplace/linked-token-registry"
    );
    const plan = await planLinkedTokenRegistryWrite({
      chain: "boing",
      collectionAddress: A,
      creatorAddress: SENDER,
      desiredTokens: [{ address: B }],
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toBe("registry_address_unset");
    if (prevReg) process.env.NEXT_PUBLIC_BOING_LINKED_NFT_TOKEN_REGISTRY = prevReg;
    else delete process.env.NEXT_PUBLIC_BOING_LINKED_NFT_TOKEN_REGISTRY;
  });

  it("merges display labels onto registry peers", () => {
    const merged = mergeLinkedTokenLabels(
      [{ address: A, label: null, chain: "boing" }],
      [{ address: A, label: "GOLD", chain: "boing" }],
    );
    expect(merged[0]?.label).toBe("GOLD");
  });
});
