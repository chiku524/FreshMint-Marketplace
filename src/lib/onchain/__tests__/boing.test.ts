import { describe, expect, it } from "vitest";
import {
  getNetwork,
  listBridgeNetworks,
  listNetworks,
  resolveNetwork,
} from "@/lib/chains/registry";
import {
  buildBoingMintIntent,
  buildBoingPurchaseIntent,
  encodeBoingTransferNft,
  isBoingNativeAccountIdHex,
  normalizeBoingAccountId,
  resolveBoingNftCollectionBytecode,
  SELECTOR_TRANSFER_NFT,
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
    expect(resolveNetwork("ethereum", "solana")).toBe("solana");
    expect(resolveNetwork("ethereum", "boing")).toBe("boing");
    expect(resolveNetwork("base", "evm")).toBe("base");
  });
});

describe("boing purchase intent", () => {
  it("simulates when the buyer or collection is not a native account", () => {
    const buy = buildBoingPurchaseIntent({
      buyerAddress: "0xmira0000000000000000000000000000000001",
      listingId: "listing-boing-1",
      amountUsd: 32,
    });
    expect(buy.status).toBe("simulated");
    expect(buy.txHash).toMatch(/^0x[0-9a-f]+$/);
    expect(buy.walletTx).toBeUndefined();
  });

  it("asks the buyer wallet to mint when no collection is configured", () => {
    const previous = process.env.NEXT_PUBLIC_BOING_NFT_COLLECTION;
    delete process.env.NEXT_PUBLIC_BOING_NFT_COLLECTION;
    const buy = buildBoingPurchaseIntent({
      buyerAddress: ACCOUNT,
      listingId: "listing-boing-1",
      amountUsd: 32,
      title: "Spring Latch",
    });
    if (previous) process.env.NEXT_PUBLIC_BOING_NFT_COLLECTION = previous;
    expect(buy.status).toBe("pending_wallet");
    expect(buy.walletTx?.tx.type).toBe("contract_deploy_meta");
  });

  it("builds transfer_nft calldata when buyer and collection are native", () => {
    const collection = `0x${"22".repeat(32)}`;
    const buy = buildBoingPurchaseIntent({
      buyerAddress: ACCOUNT,
      listingId: "listing-boing-1",
      collection,
      amountUsd: 32,
    });
    expect(buy.status).toBe("pending_wallet");
    expect(buy.walletTx?.tx.type).toBe("contract_call");
    expect(buy.walletTx?.tx.to).toBe(collection);
    expect(String(buy.walletTx?.tx.calldata)).toMatch(/^0x/);
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
    const bytecode = String(mint.walletTx.tx.bytecode ?? "");
    expect(bytecode.startsWith("0x")).toBe(true);
    expect(bytecode.length).toBeGreaterThan(100);
    expect(bytecode).toBe(resolveBoingNftCollectionBytecode());
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
    expect(String(mint.walletTx.tx.calldata)).toMatch(
      new RegExp(`0x${"0".repeat(62)}${SELECTOR_TRANSFER_NFT.toString(16).padStart(2, "0")}`),
    );
  });

  it("encodes reference transfer_nft as 96-byte calldata", () => {
    const to = `0x${"33".repeat(32)}`;
    const tokenId = "aa".repeat(32);
    const data = encodeBoingTransferNft(to, tokenId);
    expect(data.length).toBe(2 + 96 * 2);
    expect(data.endsWith(tokenId)).toBe(true);
  });
});
