import { afterEach, describe, expect, it, vi } from "vitest";

const OWNER = "0xabc0000000000000000000000000000000000001";
const OTHER = "0xdef0000000000000000000000000000000000002";
const CONTRACT = "0x2222222222222222222222222222222222222222";
const TREASURY = "0x1111111111111111111111111111111111111111";
const OPERATOR = "0x3333333333333333333333333333333333333333";

describe("prepareCollectionSetFeeRecipients", () => {
  const prevTreasury = process.env.NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS;
  const prevOperator = process.env.NEXT_PUBLIC_PLATFORM_OPERATOR_ADDRESS;

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/marketplace/service");
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

  async function withCollection(collection: Record<string, unknown>) {
    vi.doMock("@/lib/marketplace/service", () => ({
      getDiscoveryEngine: async () => ({
        state: {
          collections: new Map([[String(collection.id), collection]]),
        },
      }),
    }));
    process.env.NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS = TREASURY;
    process.env.NEXT_PUBLIC_PLATFORM_OPERATOR_ADDRESS = OPERATOR;
    const { prepareCollectionSetFeeRecipients } = await import(
      "@/lib/marketplace/set-fee-recipients"
    );
    return prepareCollectionSetFeeRecipients;
  }

  it("returns a pending_wallet intent for the collection owner on EVM", async () => {
    const prepare = await withCollection({
      id: "col-1",
      title: "Test",
      creatorId: "user-1",
      chain: "evm",
      network: "ethereum",
      heroListingId: null,
      sampleListingIds: [],
      totalItems: 1,
      contractAddress: CONTRACT,
      deployStatus: "confirmed",
    });

    const result = await prepare({
      actorId: "user-1",
      collectionId: "col-1",
      fromAddress: OWNER,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe("pending_wallet");
    expect(result.walletTx.to).toBe(CONTRACT);
    expect(result.walletTx.from).toBe(OWNER);
    expect(result.walletTx.data.startsWith("0x")).toBe(true);
    expect(result.feeRecipients.treasury).toBe(TREASURY);
    expect(result.feeRecipients.operator).toBe(OPERATOR);
  });

  it("forbids non-owners", async () => {
    const prepare = await withCollection({
      id: "col-1",
      title: "Test",
      creatorId: "user-1",
      chain: "evm",
      network: "ethereum",
      heroListingId: null,
      sampleListingIds: [],
      totalItems: 1,
      contractAddress: CONTRACT,
      deployStatus: "confirmed",
    });
    const result = await prepare({
      actorId: "intruder",
      collectionId: "col-1",
      fromAddress: OTHER,
    });
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("rejects Solana collections", async () => {
    const prepare = await withCollection({
      id: "col-sol",
      title: "Sol",
      creatorId: "user-1",
      chain: "solana",
      network: "solana",
      heroListingId: null,
      sampleListingIds: [],
      totalItems: 1,
      contractAddress: "So11111111111111111111111111111111111111112",
      deployStatus: "confirmed",
    });
    const result = await prepare({
      actorId: "user-1",
      collectionId: "col-sol",
      fromAddress: OWNER,
    });
    expect(result).toEqual({ ok: false, error: "evm_only" });
  });

  it("requires a deployed contract", async () => {
    const prepare = await withCollection({
      id: "col-2",
      title: "Draft",
      creatorId: "user-1",
      chain: "evm",
      network: "base",
      heroListingId: null,
      sampleListingIds: [],
      totalItems: 0,
      contractAddress: null,
      deployStatus: "none",
    });
    const result = await prepare({
      actorId: "user-1",
      collectionId: "col-2",
      fromAddress: OWNER,
    });
    expect(result).toEqual({ ok: false, error: "collection_not_deployed" });
  });
});
