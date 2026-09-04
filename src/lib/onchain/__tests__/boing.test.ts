import { describe, expect, it } from "vitest";
import {
  getNetwork,
  listBridgeNetworks,
  listNetworks,
  resolveNetwork,
} from "@/lib/chains/registry";
import {
  buildBoingMintIntent,
  isBoingNativeAccountIdHex,
  normalizeBoingAccountId,
} from "@/lib/onchain/boing";

const ACCOUNT = `0x${"11".repeat(32)}`;

describe("boing network registry", () => {
  it("registers Boing Testnet and keeps it off Relay", () => {
    const network = getNetwork("boing");
    expect(network.vm).toBe("boing");
    expect(network.chainId).toBe(6913);
    expect(network.nativeSymbol).toBe("BOING");
    expect(listNetworks().some((n) => n.id === "boing")).toBe(true);
    expect(listBridgeNetworks().some((n) => n.id === "boing")).toBe(false);
    expect(resolveNetwork(undefined, "boing")).toBe("boing");
  });
});

describe("boing account ids", () => {
  it("accepts only 32-byte hex account ids", () => {
    expect(isBoingNativeAccountIdHex(ACCOUNT)).toBe(true);
    expect(isBoingNativeAccountIdHex("0xabc")).toBe(false);
    expect(isBoingNativeAccountIdHex("0x" + "ab".repeat(20))).toBe(false);
    expect(normalizeBoingAccountId(`0x${"AB".repeat(32)}`)).toBe(
      `0x${"ab".repeat(32)}`,
    );
  });
});

describe("boing mint intent", () => {
  it("uses contract_deploy_meta when no collection is configured", () => {
    const previous = process.env.NEXT_PUBLIC_BOING_NFT_COLLECTION;
    delete process.env.NEXT_PUBLIC_BOING_NFT_COLLECTION;
    const mint = buildBoingMintIntent({
      creatorAddress: ACCOUNT,
      metadataUri: "https://example.com/meta.json",
      listingId: "listing-boing-1",
      title: "Boing Work",
    });
    if (previous) process.env.NEXT_PUBLIC_BOING_NFT_COLLECTION = previous;
    expect(mint.chain).toBe("boing");
    expect(mint.walletTx.tx.type).toBe("contract_deploy_meta");
    expect(mint.walletTx.tx.purpose_category).toBe("nft");
    expect(mint.walletTx.tx.asset_symbol).toBe("FMINT");
  });

  it("uses contract_call when a collection account is configured", () => {
    const previous = process.env.NEXT_PUBLIC_BOING_NFT_COLLECTION;
    process.env.NEXT_PUBLIC_BOING_NFT_COLLECTION = `0x${"22".repeat(32)}`;
    const mint = buildBoingMintIntent({
      creatorAddress: ACCOUNT,
      metadataUri: "https://example.com/meta.json",
      listingId: "listing-boing-2",
      title: "Collection Mint",
    });
    if (previous) process.env.NEXT_PUBLIC_BOING_NFT_COLLECTION = previous;
    else delete process.env.NEXT_PUBLIC_BOING_NFT_COLLECTION;
    expect(mint.walletTx.tx.type).toBe("contract_call");
    expect(mint.walletTx.tx.to).toBe(`0x${"22".repeat(32)}`);
    expect(typeof mint.walletTx.tx.calldata).toBe("string");
  });
});
