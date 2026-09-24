import { afterEach, describe, expect, it } from "vitest";
import {
  buildEvmPurchaseIntent,
  buildEvmSetFeeRecipientsIntent,
} from "@/lib/onchain/evm";

const BUYER = "0xabc0000000000000000000000000000000000001";
const MARKET = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";

describe("evm purchase intent", () => {
  const previous = process.env.NEXT_PUBLIC_EVM_MARKET_ADDRESS_ETHEREUM;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_EVM_MARKET_ADDRESS_ETHEREUM;
    } else {
      process.env.NEXT_PUBLIC_EVM_MARKET_ADDRESS_ETHEREUM = previous;
    }
  });

  it("simulates catalog buys when no live market or minted token exists", () => {
    delete process.env.NEXT_PUBLIC_EVM_MARKET_ADDRESS_ETHEREUM;
    const buy = buildEvmPurchaseIntent({
      buyerAddress: BUYER,
      tokenId: "0",
      network: "ethereum",
      amountUsd: 45,
    });
    expect(buy.status).toBe("simulated");
    expect(buy.walletTx).toBeUndefined();
  });

  it("mints to the buyer when the listing is not on-chain but a market is live", () => {
    process.env.NEXT_PUBLIC_EVM_MARKET_ADDRESS_ETHEREUM = MARKET;
    const buy = buildEvmPurchaseIntent({
      buyerAddress: BUYER,
      tokenId: "0",
      network: "ethereum",
      amountUsd: 45,
      tokenUri: "https://freshmint.local/metadata/listing-fresh-1",
    });
    expect(buy.status).toBe("pending_wallet");
    expect(buy.walletTx?.to).toBe(MARKET);
    expect(buy.walletTx?.from).toBe(BUYER);
    expect(buy.walletTx?.data.startsWith("0x")).toBe(true);
  });

  it("calls buy() when the token is already minted", () => {
    process.env.NEXT_PUBLIC_EVM_MARKET_ADDRESS_ETHEREUM = MARKET;
    const buy = buildEvmPurchaseIntent({
      buyerAddress: BUYER,
      tokenId: "7",
      network: "ethereum",
      contractAddress: TOKEN,
      amountUsd: 45,
    });
    expect(buy.status).toBe("pending_wallet");
    expect(buy.walletTx?.to).toBe(TOKEN);
    expect(buy.walletTx?.value).toMatch(/^0x/);
  });
});

describe("evm setFeeRecipients intent", () => {
  const prevTreasury = process.env.NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS;
  const prevOperator = process.env.NEXT_PUBLIC_PLATFORM_OPERATOR_ADDRESS;

  afterEach(() => {
    if (prevTreasury === undefined) {
      delete process.env.NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS;
    } else {
      process.env.NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS = prevTreasury;
    }
    if (prevOperator === undefined) {
      delete process.env.NEXT_PUBLIC_PLATFORM_OPERATOR_ADDRESS;
    } else {
      process.env.NEXT_PUBLIC_PLATFORM_OPERATOR_ADDRESS = prevOperator;
    }
  });

  it("builds a setFeeRecipients wallet tx for the collection owner", () => {
    process.env.NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS = MARKET;
    process.env.NEXT_PUBLIC_PLATFORM_OPERATOR_ADDRESS = BUYER;
    const intent = buildEvmSetFeeRecipientsIntent({
      network: "ethereum",
      contractAddress: TOKEN,
      ownerAddress: BUYER,
    });
    expect(intent.status).toBe("pending_wallet");
    expect(intent.walletTx?.to).toBe(TOKEN);
    expect(intent.walletTx?.from).toBe(BUYER);
    expect(intent.walletTx?.data.startsWith("0x")).toBe(true);
    expect(intent.walletTx?.value).toBe("0x0");
  });

  it("simulates when owner address is not a valid EVM address", () => {
    const intent = buildEvmSetFeeRecipientsIntent({
      network: "ethereum",
      contractAddress: TOKEN,
      ownerAddress: "not-an-address",
    });
    expect(intent.status).toBe("simulated");
    expect(intent.walletTx).toBeUndefined();
  });
});

