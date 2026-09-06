import { afterEach, describe, expect, it } from "vitest";
import {
  buildCollectionDeployIntent,
  buildCollectionMintBatches,
  EVM_MINT_BATCH_SIZE,
} from "@/lib/onchain/collection";
import { buildEvmTransferIntent } from "@/lib/onchain/evm";

const CREATOR = "0xabc0000000000000000000000000000000000001";
const COLLECTION = "0x2222222222222222222222222222222222222222";
const ESCROW = "0x3333333333333333333333333333333333333333";

describe("collection deploy + mint intents", () => {
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

  it("builds an EVM collection deploy wallet tx for the creator", () => {
    process.env.NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS = ESCROW;
    process.env.NEXT_PUBLIC_PLATFORM_OPERATOR_ADDRESS = ESCROW;
    const deploy = buildCollectionDeployIntent({
      collectionId: "col-test-1",
      title: "Dawn Set",
      creatorAddress: CREATOR,
      network: "ethereum",
    });
    expect(deploy.chain).toBe("evm");
    expect(deploy.status).toBe("pending_wallet");
    expect(deploy.walletTx).toBeDefined();
    expect((deploy.walletTx as { chain: string }).chain).toBe("evm");
    expect((deploy.walletTx as { to?: string }).to).toBeUndefined();
    expect((deploy.walletTx as { data: string }).data.startsWith("0x")).toBe(
      true,
    );
    expect(deploy.escrowAddress.toLowerCase()).toBe(ESCROW.toLowerCase());
  });

  it("batches EVM mints into chunks of EVM_MINT_BATCH_SIZE", () => {
    const items = Array.from({ length: EVM_MINT_BATCH_SIZE + 3 }, (_, i) => ({
      listingId: `listing-${i}`,
      tokenUri: `https://example.com/${i}.png`,
    }));
    const batches = buildCollectionMintBatches({
      network: "ethereum",
      contractAddress: COLLECTION,
      creatorAddress: CREATOR,
      escrowAddress: ESCROW,
      items,
    });
    expect(batches).toHaveLength(2);
    expect(batches[0]?.listingIds).toHaveLength(EVM_MINT_BATCH_SIZE);
    expect(batches[1]?.listingIds).toHaveLength(3);
    expect(batches[0]?.walletTx).toBeDefined();
    expect((batches[0]?.walletTx as { to: string }).to).toBe(COLLECTION);
  });

  it("builds a transfer intent for withdraw of an already-minted token", () => {
    const transfer = buildEvmTransferIntent({
      network: "ethereum",
      contractAddress: COLLECTION,
      tokenId: "7",
      fromAddress: ESCROW,
      toAddress: CREATOR,
    });
    expect(transfer.status).toBe("pending_wallet");
    expect(transfer.walletTx?.to).toBe(COLLECTION);
    expect(transfer.tokenId).toBe("7");
  });
});
