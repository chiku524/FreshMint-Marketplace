import { describe, expect, it } from "vitest";
import type { Listing } from "@/lib/discovery/types";
import {
  extractAlchemyApiKey,
  isUsableWalletAddress,
  matchWalletNftsToListings,
  mergeWalletHeldListings,
  nftAssetKey,
  normalizeTokenId,
  parseAlchemyOwnedNfts,
  parseDasAssets,
  parseReservoirTokens,
  resolveMediaUrl,
  walletNftsNotOnMarketplace,
  type WalletNft,
} from "@/lib/wallet/inventory";

const target = {
  network: "ethereum" as const,
  networkLabel: "Ethereum",
  alchemy: "eth-mainnet",
  reservoir: "https://api.reservoir.tools",
  tokenExplorer: (c: string, id: string) =>
    `https://etherscan.io/token/${c}?a=${id}`,
};

function listing(partial: Partial<Listing> & Pick<Listing, "id">): Listing {
  return {
    title: partial.title ?? "Work",
    description: "",
    creatorId: "artist-fresh",
    type: "single",
    chain: "evm",
    network: "ethereum",
    stage: "soft_launch",
    priceUsd: 10,
    medium: "digital_ink",
    styleTags: [],
    mediaHash: "hash",
    metadataComplete: true,
    originalMedia: true,
    createdAt: 1,
    softLaunchedAt: 1,
    risingEligibleAt: null,
    featuredAt: null,
    oeStartsAt: null,
    oeEndsAt: null,
    auctionStartsAt: null,
    auctionEndsAt: null,
    collectionId: null,
    isCollectionHero: false,
    signals: {
      saves: 0,
      follows: 0,
      dwellMsTotal: 0,
      uniqueViewers: 0,
      impressionsToday: 0,
      impressionsThisWeek: 0,
      pageViews: 0,
      reportRate: 0,
      nominationScore: 0,
    },
    delisted: false,
    appealStatus: "none",
    ...partial,
  };
}

describe("wallet inventory helpers", () => {
  it("extracts an Alchemy key from RPC URLs", () => {
    expect(extractAlchemyApiKey({ ALCHEMY_API_KEY: "direct-key" })).toBe(
      "direct-key",
    );
    expect(
      extractAlchemyApiKey({
        EVM_RPC_URL_ETHEREUM: "https://eth-mainnet.g.alchemy.com/v2/rpc-key",
      }),
    ).toBe("rpc-key");
    expect(extractAlchemyApiKey({})).toBeNull();
  });

  it("normalizes hex and decimal token ids", () => {
    expect(normalizeTokenId("0x0a")).toBe("10");
    expect(normalizeTokenId("10")).toBe("10");
    expect(normalizeTokenId("")).toBe("0");
  });

  it("resolves ipfs media", () => {
    expect(resolveMediaUrl("ipfs://QmHash/img.png")).toBe(
      "https://ipfs.io/ipfs/QmHash/img.png",
    );
  });

  it("rejects seed demo addresses", () => {
    expect(
      isUsableWalletAddress("evm", "0xfresh00000000000000000000000000000001"),
    ).toBe(false);
    expect(
      isUsableWalletAddress("evm", "0x1111111111111111111111111111111111111111"),
    ).toBe(true);
    expect(isUsableWalletAddress("solana", "not-a-key")).toBe(false);
  });
});

describe("indexer parsers", () => {
  it("parses Alchemy owned NFTs", () => {
    const nfts = parseAlchemyOwnedNfts(
      {
        ownedNfts: [
          {
            contract: { address: "0xAbc", name: "Cats" },
            tokenId: "0x0a",
            name: "Cat #10",
            image: { cachedUrl: "https://img.example/cat.png" },
          },
        ],
      },
      { ownerAddress: "0x1111111111111111111111111111111111111111", target },
    );
    expect(nfts).toHaveLength(1);
    expect(nfts[0].title).toBe("Cat #10");
    expect(nfts[0].tokenId).toBe("10");
    expect(nfts[0].mediaUrl).toBe("https://img.example/cat.png");
  });

  it("parses Reservoir tokens", () => {
    const nfts = parseReservoirTokens(
      {
        tokens: [
          {
            token: {
              contract: "0xDef",
              tokenId: "7",
              name: "Piece",
              image: "ipfs://cid/a.png",
            },
          },
        ],
      },
      { ownerAddress: "0x1111111111111111111111111111111111111111", target },
    );
    expect(nfts[0].title).toBe("Piece");
    expect(nfts[0].mediaUrl).toBe("https://ipfs.io/ipfs/cid/a.png");
  });

  it("parses Helius DAS assets", () => {
    const nfts = parseDasAssets(
      {
        result: {
          items: [
            {
              id: "SoLMint1111111111111111111111111111111111",
              content: {
                metadata: { name: "Core drop" },
                links: { image: "https://img.example/sol.png" },
              },
            },
          ],
        },
      },
      {
        ownerAddress: "owner",
        networkLabel: "Solana",
        explorerUrl: (mint) => `https://explorer.solana.com/address/${mint}`,
      },
    );
    expect(nfts[0].title).toBe("Core drop");
    expect(nfts[0].chain).toBe("solana");
  });
});

describe("marketplace matching", () => {
  const nft: WalletNft = {
    id: nftAssetKey("evm", "0xABC", "10"),
    chain: "evm",
    network: "ethereum",
    networkLabel: "Ethereum",
    ownerAddress: "0x1111111111111111111111111111111111111111",
    contractAddress: "0xABC",
    tokenId: "10",
    title: "On-chain",
    explorerUrl: "https://etherscan.io",
    listingId: null,
  };

  it("attaches a FreshMint listing when contract and token match", () => {
    const matched = matchWalletNftsToListings(
      [nft],
      [
        listing({
          id: "lst-1",
          contractAddress: "0xabc",
          tokenId: "0x0a",
        }),
      ],
    );
    expect(matched[0].listingId).toBe("lst-1");
  });

  it("adds wallet-held marketplace works that were never purchased in-app", () => {
    const created = [listing({ id: "mine" })];
    const owned = [
      {
        purchaseId: "p1",
        purchasedAt: 1,
        amountUsd: 12,
        txHash: null,
        listing: listing({ id: "bought" }),
      },
    ];
    const heldListing = listing({
      id: "lst-1",
      contractAddress: "0xabc",
      tokenId: "10",
    });
    const held = matchWalletNftsToListings([nft], [heldListing]);
    const merged = mergeWalletHeldListings(owned, created, held, [heldListing]);
    expect(merged.map((item) => item.listing.id)).toEqual(["bought", "lst-1"]);
  });

  it("keeps unmatched wallet NFTs for the In wallet rail", () => {
    const leftover = walletNftsNotOnMarketplace(
      [nft],
      [listing({ id: "mine" })],
      [],
    );
    expect(leftover).toHaveLength(1);
  });
});
