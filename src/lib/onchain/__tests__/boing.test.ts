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
  encodeBoingOwnerOf,
  encodeBoingTransferNft,
  extractBoingTxHash,
  isBoingMempoolAccepted,
  isBoingNativeAccountIdHex,
  isProvisionalBoingCollectionAddress,
  normalizeBoingAccountId,
  normalizeBoingTokenIdWord,
  predictNonceDerivedContractAddress,
  provisionalBoingCollectionAddress,
  referenceNftOwnerStorageKey,
  REF_NFT_OWNER_STORAGE_XOR_HEX,
  resolveBoingNftCollectionBytecode,
  SELECTOR_OWNER_OF,
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
    expect(buy.walletTx?.tx.contract).toBe(collection);
    expect(buy.walletTx?.tx.to).toBe(collection);
    expect(String(buy.walletTx?.tx.calldata)).toMatch(/^0x/);
  });
});

describe("boing deploy address helpers", () => {
  it("matches boing-sdk nonce-derived golden vector", () => {
    const sender = `0x${"01".repeat(32)}`;
    expect(predictNonceDerivedContractAddress(sender, BigInt(0))).toBe(
      "0x6d2179dfe190fd0ea25ea5136e65f6b04ff64a51d6476a01cc0078a0edb79602",
    );
  });

  it("flags provisional FreshMint placeholders", () => {
    const id = "col-goon-squad";
    const provisional = provisionalBoingCollectionAddress(id);
    expect(isProvisionalBoingCollectionAddress(id, provisional)).toBe(true);
    expect(
      isProvisionalBoingCollectionAddress(id, `0x${"22".repeat(32)}`),
    ).toBe(false);
  });

  it("extracts tx ids from wallet result shapes", () => {
    const hash = `0x${"ab".repeat(32)}`;
    expect(extractBoingTxHash(hash)).toBe(hash);
    expect(extractBoingTxHash({ tx_id: hash })).toBe(hash);
    expect(extractBoingTxHash({ hash })).toBe(hash);
    expect(extractBoingTxHash({ tx_hash: "ok" })).toBeNull();
    expect(extractBoingTxHash({ result: { tx_id: hash } })).toBe(hash);
    expect(extractBoingTxHash([hash])).toBe(hash);
  });

  it("treats node mempool ok as accepted without a tx id", () => {
    expect(isBoingMempoolAccepted("ok")).toBe(true);
    expect(isBoingMempoolAccepted("0xok")).toBe(true);
    expect(isBoingMempoolAccepted({ tx_hash: "ok" })).toBe(true);
    expect(isBoingMempoolAccepted({ result: { tx_hash: "ok" } })).toBe(true);
    expect(isBoingMempoolAccepted(`0x${"ab".repeat(32)}`)).toBe(false);
    expect(isBoingMempoolAccepted({ tx_id: `0x${"cd".repeat(32)}` })).toBe(
      false,
    );
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

  it("detects provisional collection placeholders", () => {
    const id = "col-test";
    const provisional = provisionalBoingCollectionAddress(id);
    expect(isProvisionalBoingCollectionAddress(id, provisional)).toBe(true);
    expect(
      isProvisionalBoingCollectionAddress(id, `0x${"22".repeat(32)}`),
    ).toBe(false);
  });

  it("normalizes token id words and owner storage keys", () => {
    const tid = `0x${"aa".repeat(32)}`;
    expect(normalizeBoingTokenIdWord(tid)).toBe(tid);
    expect(normalizeBoingTokenIdWord("7")).toMatch(/^0x0{62}07$/);
    const key = referenceNftOwnerStorageKey(tid);
    expect(key).toMatch(/^0x[0-9a-f]{64}$/);
    const a = Buffer.from(tid.slice(2), "hex");
    const b = Buffer.from(REF_NFT_OWNER_STORAGE_XOR_HEX.slice(2), "hex");
    const expected = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) expected[i] = a[i]! ^ b[i]!;
    expect(key).toBe(`0x${expected.toString("hex")}`);
  });

  it("encodes owner_of calldata", () => {
    const tid = "bb".repeat(32);
    const data = encodeBoingOwnerOf(tid);
    expect(data.length).toBe(2 + 96 * 2);
    expect(data).toMatch(
      new RegExp(
        `0x${"0".repeat(62)}${SELECTOR_OWNER_OF.toString(16).padStart(2, "0")}`,
      ),
    );
    expect(data.endsWith(`${"00".repeat(32)}`)).toBe(true);
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
    expect(mint.walletTx.tx.contract).toBe(`0x${"22".repeat(32)}`);
    expect(mint.walletTx.tx.to).toBe(`0x${"22".repeat(32)}`);
    expect(typeof mint.walletTx.tx.calldata).toBe("string");
    expect(String(mint.walletTx.tx.calldata)).toMatch(
      new RegExp(
        `0x${"0".repeat(62)}${SELECTOR_TRANSFER_NFT.toString(16).padStart(2, "0")}`,
      ),
    );
  });

  it("prefers an explicit per-collection address over the market env", () => {
    const previous = process.env.NEXT_PUBLIC_BOING_NFT_COLLECTION;
    process.env.NEXT_PUBLIC_BOING_NFT_COLLECTION = `0x${"22".repeat(32)}`;
    const perCollection = `0x${"33".repeat(32)}`;
    const mint = buildBoingMintIntent({
      creatorAddress: ACCOUNT,
      metadataUri: "https://example.com/meta.json",
      listingId: "listing-boing-3",
      title: "Goon Squad Mint",
      collectionAddress: perCollection,
    });
    if (previous) process.env.NEXT_PUBLIC_BOING_NFT_COLLECTION = previous;
    else delete process.env.NEXT_PUBLIC_BOING_NFT_COLLECTION;
    expect(mint.walletTx.tx.contract).toBe(perCollection);
    expect(mint.contractAddress).toBe(perCollection);
  });

  it("encodes reference transfer_nft as 96-byte calldata", () => {
    const to = `0x${"33".repeat(32)}`;
    const tokenId = "aa".repeat(32);
    const data = encodeBoingTransferNft(to, tokenId);
    expect(data.length).toBe(2 + 96 * 2);
    expect(data.endsWith(tokenId)).toBe(true);
  });
});
