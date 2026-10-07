import { afterEach, describe, expect, it } from "vitest";
import {
  boingPaymentAmountString,
  buildNativePaymentWalletTx,
  settlementAddressFor,
} from "@/lib/marketplace/crypto-purchase";
import { buildBoingNftTransferIntent } from "@/lib/onchain/boing";

const BOING_ACCOUNT = `0x${"11".repeat(32)}`;
const BOING_TREASURY = `0x${"22".repeat(32)}`;
const EVM_TREASURY = "0xDde8Ec0A27467a8Eb6E7a3245e07d2D67B6B56bb";

describe("boingPaymentAmountString", () => {
  it("emits whole-unit amounts without a symbol suffix", () => {
    expect(boingPaymentAmountString(32)).toBe("32");
    expect(boingPaymentAmountString(32.5)).toBe("32.5");
    expect(boingPaymentAmountString(0)).toBe("0");
  });
});

describe("settlementAddressFor(boing)", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_PLATFORM_TREASURY_BOING;
    delete process.env.NEXT_PUBLIC_PLATFORM_OPERATOR_BOING;
    delete process.env.NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS;
  });

  it("never reuses the EVM treasury hex as a Boing AccountId", () => {
    process.env.NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS = EVM_TREASURY;
    expect(settlementAddressFor("boing")).toBe("");
  });

  it("prefers NEXT_PUBLIC_PLATFORM_TREASURY_BOING", () => {
    process.env.NEXT_PUBLIC_PLATFORM_TREASURY_BOING = BOING_TREASURY;
    process.env.NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS = EVM_TREASURY;
    expect(settlementAddressFor("boing")).toBe(BOING_TREASURY);
  });

  it("falls back to the creator Boing wallet", () => {
    expect(
      settlementAddressFor("boing", { fallbackBoing: BOING_ACCOUNT }),
    ).toBe(BOING_ACCOUNT);
  });
});

describe("buildNativePaymentWalletTx(boing)", () => {
  it("builds a native transfer with a numeric amount and 32-byte to", async () => {
    const { walletTx, quote } = await buildNativePaymentWalletTx({
      network: "boing",
      fromAddress: BOING_ACCOUNT,
      toAddress: BOING_TREASURY,
      amountUsd: 32,
      listingChain: "boing",
    });
    expect(quote.symbol).toBe("BOING");
    expect(walletTx.chain).toBe("boing");
    const tx = walletTx.tx as {
      type: string;
      to: string;
      amount: string;
    };
    expect(tx.type).toBe("transfer");
    expect(tx.to).toBe(BOING_TREASURY);
    expect(tx.amount).toBe(boingPaymentAmountString(quote.amount));
    expect(tx.amount).not.toMatch(/BOING/i);
  });

  it("rejects EVM-length settlement addresses", async () => {
    await expect(
      buildNativePaymentWalletTx({
        network: "boing",
        fromAddress: BOING_ACCOUNT,
        toAddress: EVM_TREASURY,
        amountUsd: 10,
        listingChain: "boing",
      }),
    ).rejects.toThrow("boing_settlement_unavailable");
  });
});

describe("buildBoingNftTransferIntent", () => {
  it("builds transfer_nft contract_call instead of mint/deploy", () => {
    const collection = `0x${"33".repeat(32)}`;
    const intent = buildBoingNftTransferIntent({
      collectionAddress: collection,
      tokenId: "aa".repeat(32),
      toAddress: BOING_ACCOUNT,
      signerAddress: BOING_TREASURY,
      listingId: "listing-boing-1",
    });
    expect(intent.status).toBe("pending_wallet");
    expect(intent.walletTx.tx.type).toBe("contract_call");
    expect(intent.walletTx.tx.contract).toBe(collection);
    expect(String(intent.walletTx.tx.calldata)).toMatch(/^0x/);
  });
});
