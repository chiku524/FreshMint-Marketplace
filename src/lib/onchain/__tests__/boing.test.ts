import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getNetwork,
  listBridgeNetworks,
  listNetworks,
  resolveNetwork,
} from "@/lib/chains/registry";
import {
  BOING_TESTNET_RPC_FALLBACKS,
  buildBoingMintIntent,
  buildBoingPurchaseIntent,
  coerceBoingAccountIdFromRpc,
  encodeBoingOwnerOf,
  encodeBoingTransferNft,
  extractBoingTxHash,
  findBoingNftCollectionDeploy,
  formatBoingBalanceUserMessage,
  getBoingNativeBalance,
  isBoingMempoolAccepted,
  isBoingNativeAccountIdHex,
  isBoingRpcEdgeBlocked,
  isProvisionalBoingCollectionAddress,
  normalizeBoingAccountId,
  normalizeBoingTokenIdWord,
  predictNonceDerivedContractAddress,
  provisionalBoingCollectionAddress,
  referenceNftOwnerStorageKey,
  REF_NFT_OWNER_STORAGE_XOR_HEX,
  resolveBoingNftCollectionBytecode,
  resolveBoingRpcEndpoints,
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

describe("boing RPC edge + fallbacks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BOING_RPC_URL;
    delete process.env.BOING_RPC_FALLBACK_URLS;
    delete process.env.BOING_RPC_DISABLE_DEFAULT_FALLBACKS;
  });

  it("detects Cloudflare HTML challenges", () => {
    expect(
      isBoingRpcEdgeBlocked(
        403,
        "<html>Just a moment...</html>",
        "text/html; charset=UTF-8",
      ),
    ).toBe(true);
    expect(isBoingRpcEdgeBlocked(200, '{"ok":true}', "application/json")).toBe(
      false,
    );
  });

  it("includes Fly testnet fallbacks after the primary URL", () => {
    process.env.BOING_RPC_URL = "https://testnet-rpc.boing.network/";
    const urls = resolveBoingRpcEndpoints();
    expect(urls[0]).toBe("https://testnet-rpc.boing.network/");
    expect(urls).toEqual(
      expect.arrayContaining([...BOING_TESTNET_RPC_FALLBACKS]),
    );
  });

  it("formats gated balance errors without raw status codes", () => {
    const msg = formatBoingBalanceUserMessage("boing_rpc_http_403");
    expect(msg.toLowerCase()).toContain("explorer");
    expect(msg).not.toMatch(/boing_rpc_http_403/);
  });

  it("falls back to the next RPC when the primary edge is blocked", async () => {
    process.env.BOING_RPC_URL = "https://primary.example/";
    process.env.BOING_RPC_FALLBACK_URLS = "https://fallback.example/";
    process.env.BOING_RPC_DISABLE_DEFAULT_FALLBACKS = "1";

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("primary.example")) {
        return new Response("<html>Just a moment...</html>", {
          status: 403,
          headers: { "Content-Type": "text/html" },
        });
      }
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { balance: "42" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getBoingNativeBalance(ACCOUNT);
    expect(result).toEqual({ balance: "42", ok: true });
    expect(fetchMock.mock.calls.length).toBe(2);
    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)
      ?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/FreshMintMarketplace/);
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("coerces AccountIds from hex strings and 32-byte RPC arrays", () => {
    const hex = `0x${"33".repeat(32)}`;
    expect(coerceBoingAccountIdFromRpc(hex)).toBe(hex);
    expect(coerceBoingAccountIdFromRpc(hex.slice(2))).toBe(hex);
    const bytes = Array.from({ length: 32 }, () => 0x33);
    expect(coerceBoingAccountIdFromRpc(bytes)).toBe(hex);
    expect(coerceBoingAccountIdFromRpc(Uint8Array.from(bytes))).toBe(hex);
    expect(coerceBoingAccountIdFromRpc([1, 2, 3])).toBeNull();
    expect(coerceBoingAccountIdFromRpc(null)).toBeNull();
  });

  it("finds NFT deploys when block sender is a byte array (boing-node JSON)", async () => {
    const sender = `0x${"33".repeat(32)}`;
    const senderBytes = Array.from({ length: 32 }, () => 0x33);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        method?: string;
        params?: unknown[];
      };
      if (body.method === "boing_chainHeight") {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: 10 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (body.method === "boing_getBlockByHeight") {
        const height = Number(body.params?.[0]);
        const txs =
          height === 10
            ? [
                {
                  nonce: 7,
                  sender: senderBytes,
                  payload: {
                    ContractDeployWithPurposeAndMetadata: {
                      asset_name: "Byte Array Squad",
                      asset_symbol: "FMINT",
                      bytecode: [1, 2, 3],
                    },
                  },
                },
              ]
            : [];
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: { transactions: txs },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "unexpected" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const found = await findBoingNftCollectionDeploy({
      senderAddress: sender,
      assetName: "Byte Array Squad",
      lookbackBlocks: 8,
    });
    expect(found).not.toBeNull();
    expect(found?.txNonce).toBe(7);
    expect(found?.blockHeight).toBe(10);
    expect(found?.contractAddress).toBe(
      predictNonceDerivedContractAddress(sender, 7),
    );
    expect(found?.assetName).toBe("Byte Array Squad");
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

describe("boing mint_batch v2/v3 encoding", () => {
  it("encodes selector 0x06 and 96+64n bytes", async () => {
    const {
      encodeReferenceMintBatchCalldataHex,
      SELECTOR_MINT_BATCH,
      BOING_MINT_BATCH_SIZE,
      BOING_MINT_BATCH_SIZE_V2,
      BOING_MINT_BATCH_SIZE_V3,
      boingMintBatchChunkSize,
      resolveBoingNftDeployTemplateVersion,
    } = await import("@/lib/onchain/boing");
    const to = ACCOUNT;
    const ids = [`0x${"aa".repeat(32)}`, `0x${"bb".repeat(32)}`];
    const hashes = [`0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`];
    const hex = encodeReferenceMintBatchCalldataHex(to, ids, hashes);
    const bytes = (hex.length - 2) / 2;
    expect(bytes).toBe(96 + 64 * 2);
    expect(hex).toMatch(
      new RegExp(
        `^0x${"0".repeat(62)}${SELECTOR_MINT_BATCH.toString(16).padStart(2, "0")}`,
      ),
    );
    expect(BOING_MINT_BATCH_SIZE_V2).toBe(50);
    expect(BOING_MINT_BATCH_SIZE_V3).toBe(500);
    expect(BOING_MINT_BATCH_SIZE).toBe(500);
    expect(boingMintBatchChunkSize("2")).toBe(50);
    expect(boingMintBatchChunkSize("3")).toBe(500);
    expect(resolveBoingNftDeployTemplateVersion()).toBe("3");
  });

  it("allows n up to 500 and rejects n > 500", async () => {
    const { encodeReferenceMintBatchCalldataHex } = await import(
      "@/lib/onchain/boing"
    );
    const ids500 = Array.from({ length: 500 }, (_, i) =>
      `0x${i.toString(16).padStart(64, "0")}`,
    );
    expect(() =>
      encodeReferenceMintBatchCalldataHex(ACCOUNT, ids500, ids500),
    ).not.toThrow();
    const ids501 = Array.from({ length: 501 }, (_, i) =>
      `0x${i.toString(16).padStart(64, "0")}`,
    );
    expect(() =>
      encodeReferenceMintBatchCalldataHex(ACCOUNT, ids501, ids501),
    ).toThrow(/boing_mint_batch_size/);
  });
});

describe("boing receipt tx ids", () => {
  it("does not treat mempool ok as a receipt-fetchable tx id", async () => {
    const {
      extractBoingTxHash,
      isBoingMempoolPlaceholderTxId,
      isBoingReceiptTxId,
    } = await import("@/lib/onchain/boing");
    expect(extractBoingTxHash({ tx_hash: "ok" })).toBeNull();
    expect(isBoingMempoolPlaceholderTxId("ok")).toBe(true);
    expect(isBoingMempoolPlaceholderTxId("pending:boing-accepted:abc")).toBe(
      true,
    );
    expect(isBoingReceiptTxId("ok")).toBe(false);
    expect(isBoingReceiptTxId(`0x${"ab".repeat(32)}`)).toBe(true);
  });
});

describe("waitForBoingNftTokensMinted", () => {
  it("times out when tokens stay unowned (no live RPC needed)", async () => {
    const { waitForBoingNftTokensMinted } = await import("@/lib/onchain/boing");
    const result = await waitForBoingNftTokensMinted({
      collection: ACCOUNT,
      tokenIds: [`0x${"03".repeat(32)}`],
      timeoutMs: 200,
      intervalMs: 50,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.error === "boing_token_not_on_chain" ||
          result.error.length > 0,
      ).toBe(true);
    }
  });
});
