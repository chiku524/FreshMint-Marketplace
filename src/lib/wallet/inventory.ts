import { Connection, PublicKey } from "@solana/web3.js";
import { isAddress } from "viem";
import { chainMode, getNetwork, rpcUrlFor, type NetworkId } from "@/lib/chains/registry";
import type { Chain, Listing } from "@/lib/discovery/types";
import {
  formatBoingBalanceUserMessage,
  getBoingNativeBalance,
  getBoingNftOwner,
  isBoingNativeAccountIdHex,
  isProvisionalBoingCollectionAddress,
  normalizeBoingAccountId,
  normalizeBoingTokenIdWord,
} from "@/lib/onchain/boing";
import type { ProfileWallet } from "@/lib/marketplace/profile";

export type WalletNft = {
  id: string;
  chain: Chain;
  network: NetworkId;
  networkLabel: string;
  ownerAddress: string;
  contractAddress: string;
  tokenId: string;
  title: string;
  description?: string | null;
  mediaUrl?: string | null;
  explorerUrl: string;
  listingId?: string | null;
};

export type BoingWalletBalance = {
  chain: "boing";
  network: "boing";
  address: string;
  balance: string | null;
  ok: boolean;
  error?: string;
};

export type LinkedWalletScanMeta = {
  warnings: string[];
  boingBalances: BoingWalletBalance[];
};

type FetchFn = typeof fetch;

type EvmScanTarget = {
  network: NetworkId;
  networkLabel: string;
  alchemy: string;
  reservoir: string;
  tokenExplorer: (contract: string, tokenId: string) => string;
};

const EVM_MAINNET_TARGETS: EvmScanTarget[] = [
  {
    network: "ethereum",
    networkLabel: "Ethereum",
    alchemy: "eth-mainnet",
    reservoir: "https://api.reservoir.tools",
    tokenExplorer: (c, id) => `https://etherscan.io/token/${c}?a=${id}`,
  },
  {
    network: "base",
    networkLabel: "Base",
    alchemy: "base-mainnet",
    reservoir: "https://api-base.reservoir.tools",
    tokenExplorer: (c, id) => `https://basescan.org/token/${c}?a=${id}`,
  },
  {
    network: "arbitrum",
    networkLabel: "Arbitrum",
    alchemy: "arb-mainnet",
    reservoir: "https://api-arbitrum.reservoir.tools",
    tokenExplorer: (c, id) => `https://arbiscan.io/token/${c}?a=${id}`,
  },
  {
    network: "optimism",
    networkLabel: "Optimism",
    alchemy: "opt-mainnet",
    reservoir: "https://api-optimism.reservoir.tools",
    tokenExplorer: (c, id) =>
      `https://optimistic.etherscan.io/token/${c}?a=${id}`,
  },
];

const EVM_TESTNET_TARGETS: EvmScanTarget[] = [
  {
    network: "ethereum",
    networkLabel: "Ethereum Sepolia",
    alchemy: "eth-sepolia",
    reservoir: "https://api-sepolia.reservoir.tools",
    tokenExplorer: (c, id) => `https://sepolia.etherscan.io/token/${c}?a=${id}`,
  },
  {
    network: "base",
    networkLabel: "Base Sepolia",
    alchemy: "base-sepolia",
    reservoir: "https://api-base-sepolia.reservoir.tools",
    tokenExplorer: (c, id) => `https://sepolia.basescan.org/token/${c}?a=${id}`,
  },
  {
    network: "arbitrum",
    networkLabel: "Arbitrum Sepolia",
    alchemy: "arb-sepolia",
    reservoir: "https://api-arbitrum-sepolia.reservoir.tools",
    tokenExplorer: (c, id) => `https://sepolia.arbiscan.io/token/${c}?a=${id}`,
  },
  {
    network: "optimism",
    networkLabel: "Optimism Sepolia",
    alchemy: "opt-sepolia",
    reservoir: "https://api-optimism-sepolia.reservoir.tools",
    tokenExplorer: (c, id) =>
      `https://sepolia-optimism.etherscan.io/token/${c}?a=${id}`,
  },
];

const TOKEN_PROGRAM = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const TOKEN_2022_PROGRAM = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);

const cache = new Map<string, { at: number; nfts: WalletNft[] }>();
const CACHE_MS = 60_000;

export function evmInventoryTargets(): EvmScanTarget[] {
  return chainMode() === "testnet"
    ? [...EVM_MAINNET_TARGETS, ...EVM_TESTNET_TARGETS]
    : EVM_MAINNET_TARGETS;
}

export function extractAlchemyApiKey(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const direct = env.ALCHEMY_API_KEY?.trim();
  if (direct) return direct;
  for (const value of Object.values(env)) {
    if (typeof value !== "string") continue;
    const match = value.match(
      /alchemy\.com\/(?:nft\/v3|v2)\/([A-Za-z0-9_-]+)/i,
    );
    if (match?.[1]) return match[1];
  }
  return null;
}

export function normalizeTokenId(value: string): string {
  const raw = value.trim();
  if (!raw) return "0";
  try {
    if (/^0x[0-9a-f]+$/i.test(raw)) return BigInt(raw).toString();
    if (/^\d+$/.test(raw)) return BigInt(raw).toString();
  } catch {
    /* keep raw */
  }
  return raw;
}

export function nftAssetKey(
  chain: string,
  contractAddress: string,
  tokenId: string,
): string {
  if (chain === "boing") {
    const contract = isBoingNativeAccountIdHex(contractAddress)
      ? normalizeBoingAccountId(contractAddress)
      : contractAddress.toLowerCase();
    const tid =
      normalizeBoingTokenIdWord(tokenId) ?? tokenId.trim().toLowerCase();
    return `boing:${contract}:${tid}`;
  }
  const contract =
    chain === "evm" ? contractAddress.toLowerCase() : contractAddress;
  return `${chain}:${contract}:${normalizeTokenId(tokenId)}`;
}

export function resolveMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${trimmed.slice("ipfs://".length)}`;
  }
  if (trimmed.startsWith("ar://")) {
    return `https://arweave.net/${trimmed.slice("ar://".length)}`;
  }
  return trimmed;
}

export function isUsableWalletAddress(chain: string, address: string): boolean {
  if (chain === "evm") return isAddress(address);
  if (chain === "boing") return isBoingNativeAccountIdHex(address);
  if (chain === "solana") {
    try {
      return PublicKey.isOnCurve(new PublicKey(address).toBytes());
    } catch {
      return false;
    }
  }
  return false;
}

export function parseAlchemyOwnedNfts(
  payload: unknown,
  input: {
    ownerAddress: string;
    target: EvmScanTarget;
  },
): WalletNft[] {
  const owned = (payload as { ownedNfts?: unknown[] } | null)?.ownedNfts;
  if (!Array.isArray(owned)) return [];
  return owned.flatMap((item) => {
    const row = item as {
      contract?: { address?: string; name?: string };
      tokenId?: string;
      name?: string;
      description?: string;
      image?: { cachedUrl?: string; originalUrl?: string; pngUrl?: string };
      tokenUri?: string | { raw?: string };
    };
    const contract = row.contract?.address;
    const tokenId = row.tokenId;
    if (!contract || tokenId == null) return [];
    const title =
      row.name?.trim() ||
      row.contract?.name?.trim() ||
      `${input.target.networkLabel} #${normalizeTokenId(tokenId)}`;
    return [
      {
        id: nftAssetKey("evm", contract, tokenId),
        chain: "evm" as const,
        network: input.target.network,
        networkLabel: input.target.networkLabel,
        ownerAddress: input.ownerAddress,
        contractAddress: contract,
        tokenId: normalizeTokenId(tokenId),
        title,
        description: row.description ?? null,
        mediaUrl: resolveMediaUrl(
          row.image?.cachedUrl || row.image?.originalUrl || row.image?.pngUrl,
        ),
        explorerUrl: input.target.tokenExplorer(contract, normalizeTokenId(tokenId)),
        listingId: null,
      },
    ];
  });
}

export function parseReservoirTokens(
  payload: unknown,
  input: {
    ownerAddress: string;
    target: EvmScanTarget;
  },
): WalletNft[] {
  const tokens = (payload as { tokens?: unknown[] } | null)?.tokens;
  if (!Array.isArray(tokens)) return [];
  return tokens.flatMap((item) => {
    const token = (item as { token?: Record<string, unknown> }).token;
    if (!token) return [];
    const contract = String(token.contract ?? "");
    const tokenId = String(token.tokenId ?? "");
    if (!contract || !tokenId) return [];
    const collection = token.collection as { name?: string } | undefined;
    const title =
      String(token.name ?? "").trim() ||
      collection?.name?.trim() ||
      `${input.target.networkLabel} #${normalizeTokenId(tokenId)}`;
    return [
      {
        id: nftAssetKey("evm", contract, tokenId),
        chain: "evm" as const,
        network: input.target.network,
        networkLabel: input.target.networkLabel,
        ownerAddress: input.ownerAddress,
        contractAddress: contract,
        tokenId: normalizeTokenId(tokenId),
        title,
        description: typeof token.description === "string" ? token.description : null,
        mediaUrl: resolveMediaUrl(
          typeof token.image === "string" ? token.image : null,
        ),
        explorerUrl: input.target.tokenExplorer(contract, normalizeTokenId(tokenId)),
        listingId: null,
      },
    ];
  });
}

export function parseDasAssets(
  payload: unknown,
  input: {
    ownerAddress: string;
    networkLabel: string;
    explorerUrl: (mint: string) => string;
  },
): WalletNft[] {
  const items =
    (payload as { result?: { items?: unknown[] }; items?: unknown[] } | null)
      ?.result?.items ??
    (payload as { items?: unknown[] } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const row = item as {
      id?: string;
      content?: {
        metadata?: { name?: string; description?: string };
        links?: { image?: string };
        files?: { uri?: string }[];
        json_uri?: string;
      };
    };
    const mint = row.id;
    if (!mint) return [];
    const title =
      row.content?.metadata?.name?.trim() || `Solana ${mint.slice(0, 6)}…`;
    const image =
      row.content?.links?.image ||
      row.content?.files?.find((f) => f.uri)?.uri ||
      null;
    return [
      {
        id: nftAssetKey("solana", mint, mint),
        chain: "solana" as const,
        network: "solana" as const,
        networkLabel: input.networkLabel,
        ownerAddress: input.ownerAddress,
        contractAddress: mint,
        tokenId: mint,
        title,
        description: row.content?.metadata?.description ?? null,
        mediaUrl: resolveMediaUrl(image),
        explorerUrl: input.explorerUrl(mint),
        listingId: null,
      },
    ];
  });
}

export function matchWalletNftsToListings(
  nfts: WalletNft[],
  listings: Listing[],
): WalletNft[] {
  const byKey = new Map<string, string>();
  for (const listing of listings) {
    if (!listing.contractAddress || listing.tokenId == null) continue;
    byKey.set(
      nftAssetKey(listing.chain, listing.contractAddress, listing.tokenId),
      listing.id,
    );
    // Solana mints are sometimes stored as tokenId only.
    if (listing.chain === "solana") {
      byKey.set(
        nftAssetKey("solana", listing.tokenId, listing.tokenId),
        listing.id,
      );
    }
  }
  return nfts.map((nft) => ({
    ...nft,
    listingId: byKey.get(nftAssetKey(nft.chain, nft.contractAddress, nft.tokenId)) ?? nft.listingId ?? null,
  }));
}

export function mergeWalletHeldListings<
  T extends { listing: Listing; purchaseId: string },
>(
  owned: T[],
  created: Listing[],
  walletNfts: WalletNft[],
  extraListings: Listing[] = [],
): Array<T | {
  purchaseId: string;
  purchasedAt: number;
  amountUsd: number;
  txHash: string | null;
  listing: Listing;
  fromWallet: true;
}> {
  const ownedIds = new Set(owned.map((item) => item.listing.id));
  const createdIds = new Set(created.map((listing) => listing.id));
  const listingsById = new Map(created.map((listing) => [listing.id, listing]));
  for (const item of owned) listingsById.set(item.listing.id, item.listing);
  for (const listing of extraListings) listingsById.set(listing.id, listing);

  const extras = walletNfts.flatMap((nft) => {
    if (!nft.listingId) return [];
    if (ownedIds.has(nft.listingId) || createdIds.has(nft.listingId)) return [];
    const listing = listingsById.get(nft.listingId);
    if (!listing) return [];
    ownedIds.add(nft.listingId);
    return [
      {
        purchaseId: `wallet:${nft.id}`,
        purchasedAt: 0,
        amountUsd: 0,
        txHash: null,
        listing,
        fromWallet: true as const,
      },
    ];
  });
  return [...owned, ...extras];
}

function cacheKey(wallets: ProfileWallet[]): string {
  return wallets
    .map((w) => `${w.chain}:${w.address.toLowerCase()}`)
    .sort()
    .join("|");
}

async function readJson(
  fetcher: FetchFn,
  url: string,
  init?: RequestInit,
): Promise<unknown | null> {
  try {
    const res = await fetcher(url, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const BOING_OWNER_SCAN_CAP = 48;
const BOING_OWNER_SCAN_CONCURRENCY = 6;

export type BoingScanCandidate = {
  listingId: string;
  contractAddress: string;
  tokenId: string;
  title: string;
  description?: string | null;
  mediaUrl?: string | null;
  collectionId?: string | null;
};

/** FreshMint Boing listings that are safe to ownership-check on-chain. */
export function boingScanCandidatesFromListings(
  listings: Listing[],
): BoingScanCandidate[] {
  const seen = new Set<string>();
  const out: BoingScanCandidate[] = [];
  for (const listing of listings) {
    if (listing.chain !== "boing" && listing.network !== "boing") continue;
    const contract = listing.contractAddress?.trim();
    const tokenId = listing.tokenId?.trim();
    if (!contract || !tokenId) continue;
    if (!isBoingNativeAccountIdHex(contract)) continue;
    if (
      listing.collectionId &&
      isProvisionalBoingCollectionAddress(listing.collectionId, contract)
    ) {
      continue;
    }
    const tid = normalizeBoingTokenIdWord(tokenId);
    if (!tid) continue;
    const key = `${normalizeBoingAccountId(contract)}:${tid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      listingId: listing.id,
      contractAddress: normalizeBoingAccountId(contract),
      tokenId: tid,
      title: listing.title,
      description: listing.description ?? null,
      mediaUrl: listing.mediaUrl ?? null,
      collectionId: listing.collectionId,
    });
    if (out.length >= BOING_OWNER_SCAN_CAP) break;
  }
  return out;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

/**
 * MVP Boing NFT scan: verify ownership of FreshMint-known (contract, tokenId)
 * pairs. Does not enumerate arbitrary on-chain NFTs.
 */
export async function fetchBoingNftsForAddress(
  address: string,
  candidates: BoingScanCandidate[],
  deps: { warnings?: string[] } = {},
): Promise<WalletNft[]> {
  const owner = normalizeBoingAccountId(address);
  if (!isBoingNativeAccountIdHex(owner) || candidates.length === 0) return [];

  const network = getNetwork("boing");
  const found: WalletNft[] = [];
  let rpcFailures = 0;

  const results = await mapPool(
    candidates,
    BOING_OWNER_SCAN_CONCURRENCY,
    async (candidate) => {
      const owned = await getBoingNftOwner({
        collection: candidate.contractAddress,
        tokenId: candidate.tokenId,
      });
      return { candidate, owned };
    },
  );

  for (const { candidate, owned } of results) {
    if (!owned.ok) {
      rpcFailures += 1;
      continue;
    }
    if (!owned.owner || owned.owner !== owner) continue;
    found.push({
      id: nftAssetKey("boing", candidate.contractAddress, candidate.tokenId),
      chain: "boing",
      network: "boing",
      networkLabel: network.label,
      ownerAddress: owner,
      contractAddress: candidate.contractAddress,
      tokenId: candidate.tokenId,
      title: candidate.title || `Boing ${candidate.tokenId.slice(0, 10)}…`,
      description: candidate.description ?? null,
      mediaUrl: resolveMediaUrl(candidate.mediaUrl),
      explorerUrl: network.explorerAddress(candidate.contractAddress),
      listingId: candidate.listingId,
    });
  }

  if (rpcFailures > 0 && found.length === 0 && candidates.length > 0) {
    deps.warnings?.push(
      `Boing NFT ownership checks failed for ${rpcFailures}/${candidates.length} FreshMint-known tokens (RPC/Cloudflare). Showing catalog matches only when RPC is reachable.`,
    );
  } else if (rpcFailures > 0) {
    deps.warnings?.push(
      `Boing NFT scan partially failed (${rpcFailures} token checks). Results may be incomplete.`,
    );
  }

  return found;
}

export async function fetchBoingBalancesForWallets(
  wallets: ProfileWallet[],
): Promise<BoingWalletBalance[]> {
  const boingWallets = wallets.filter(
    (w) => w.chain === "boing" && isUsableWalletAddress(w.chain, w.address),
  );
  return Promise.all(
    boingWallets.map(async (wallet) => {
      const result = await getBoingNativeBalance(wallet.address);
      if (result.ok) {
        return {
          chain: "boing" as const,
          network: "boing" as const,
          address: normalizeBoingAccountId(wallet.address),
          balance: result.balance,
          ok: true,
        };
      }
      return {
        chain: "boing" as const,
        network: "boing" as const,
        address: normalizeBoingAccountId(wallet.address),
        balance: null,
        ok: false,
        error: result.error,
      };
    }),
  );
}

async function fetchEvmNftsForAddress(
  address: string,
  fetcher: FetchFn,
): Promise<WalletNft[]> {
  const key = extractAlchemyApiKey();
  const reservoirKey = process.env.RESERVOIR_API_KEY?.trim();
  const found: WalletNft[] = [];

  await Promise.all(
    evmInventoryTargets().map(async (target) => {
      if (key) {
        const url = new URL(
          `https://${target.alchemy}.g.alchemy.com/nft/v3/${key}/getNFTsForOwner`,
        );
        url.searchParams.set("owner", address);
        url.searchParams.set("withMetadata", "true");
        url.searchParams.set("pageSize", "100");
        url.searchParams.append("excludeFilters[]", "SPAM");
        const payload = await readJson(fetcher, url.toString());
        if (payload) {
          found.push(...parseAlchemyOwnedNfts(payload, { ownerAddress: address, target }));
          return;
        }
      }

      const headers: Record<string, string> = { accept: "application/json" };
      if (reservoirKey) headers["x-api-key"] = reservoirKey;
      const payload = await readJson(
        fetcher,
        `${target.reservoir}/users/${address}/tokens/v7?limit=50`,
        { headers },
      );
      if (payload) {
        found.push(...parseReservoirTokens(payload, { ownerAddress: address, target }));
      }
    }),
  );

  return found;
}

async function fetchSolanaNftsForAddress(
  address: string,
  fetcher: FetchFn,
): Promise<WalletNft[]> {
  const rpc = process.env.HELIUS_API_KEY
    ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    : rpcUrlFor("solana");
  const cluster = /devnet/i.test(rpc) ? "devnet" : "mainnet";
  const explorer = (mint: string) =>
    cluster === "devnet"
      ? `https://explorer.solana.com/address/${mint}?cluster=devnet`
      : `https://explorer.solana.com/address/${mint}`;
  const networkLabel = cluster === "devnet" ? "Solana Devnet" : "Solana";

  const das = await readJson(fetcher, rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "freshmint-wallet-nfts",
      method: "getAssetsByOwner",
      params: {
        ownerAddress: address,
        page: 1,
        limit: 100,
      },
    }),
  });
  const fromDas = parseDasAssets(das, {
    ownerAddress: address,
    networkLabel,
    explorerUrl: explorer,
  });
  if (fromDas.length > 0) return fromDas;

  try {
    const connection = new Connection(rpc, "confirmed");
    const owner = new PublicKey(address);
    const accounts = (
      await Promise.all([
        connection.getParsedTokenAccountsByOwner(owner, {
          programId: TOKEN_PROGRAM,
        }),
        connection.getParsedTokenAccountsByOwner(owner, {
          programId: TOKEN_2022_PROGRAM,
        }),
      ])
    ).flatMap((res) => res.value);

    return accounts.flatMap(({ account }) => {
      const info = account.data.parsed?.info as
        | {
            mint?: string;
            tokenAmount?: { decimals?: number; uiAmount?: number };
          }
        | undefined;
      const mint = info?.mint;
      const amount = info?.tokenAmount;
      if (!mint || amount?.decimals !== 0 || amount.uiAmount !== 1) return [];
      return [
        {
          id: nftAssetKey("solana", mint, mint),
          chain: "solana" as const,
          network: "solana" as const,
          networkLabel,
          ownerAddress: address,
          contractAddress: mint,
          tokenId: mint,
          title: `Solana ${mint.slice(0, 6)}…`,
          description: null,
          mediaUrl: null,
          explorerUrl: explorer(mint),
          listingId: null,
        },
      ];
    });
  } catch {
    return [];
  }
}

function dedupeNfts(nfts: WalletNft[]): WalletNft[] {
  const seen = new Set<string>();
  const out: WalletNft[] = [];
  for (const nft of nfts) {
    const key = `${nft.networkLabel}:${nftAssetKey(nft.chain, nft.contractAddress, nft.tokenId)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(nft);
  }
  return out;
}

export async function fetchLinkedWalletNfts(
  wallets: ProfileWallet[],
  listings: Listing[] = [],
  deps: {
    fetch?: FetchFn;
    skipCache?: boolean;
    meta?: LinkedWalletScanMeta;
  } = {},
): Promise<WalletNft[]> {
  const usable = wallets.filter((w) => isUsableWalletAddress(w.chain, w.address));
  if (usable.length === 0) return [];

  const key = cacheKey(usable);
  const cached = cache.get(key);
  if (!deps.skipCache && cached && Date.now() - cached.at < CACHE_MS) {
    if (deps.meta) {
      deps.meta.boingBalances = await fetchBoingBalancesForWallets(usable);
      for (const bal of deps.meta.boingBalances) {
        if (!bal.ok) {
          deps.meta.warnings.push(formatBoingBalanceUserMessage(bal.error));
        }
      }
    }
    return matchWalletNftsToListings(cached.nfts, listings);
  }

  const fetcher = deps.fetch ?? fetch;
  const boingCandidates = boingScanCandidatesFromListings(listings);
  const warnings = deps.meta?.warnings;

  if (deps.meta) {
    deps.meta.boingBalances = await fetchBoingBalancesForWallets(usable);
    for (const bal of deps.meta.boingBalances) {
      if (!bal.ok) {
        deps.meta.warnings.push(formatBoingBalanceUserMessage(bal.error));
      }
    }
  }

  const collected = await Promise.all(
    usable.map(async (wallet) => {
      if (wallet.chain === "evm") {
        return fetchEvmNftsForAddress(wallet.address, fetcher);
      }
      if (wallet.chain === "solana") {
        return fetchSolanaNftsForAddress(wallet.address, fetcher);
      }
      if (wallet.chain === "boing") {
        return fetchBoingNftsForAddress(wallet.address, boingCandidates, {
          warnings,
        });
      }
      return [];
    }),
  );

  const nfts = dedupeNfts(collected.flat());
  cache.set(key, { at: Date.now(), nfts });
  return matchWalletNftsToListings(nfts, listings);
}

export function walletNftsNotOnMarketplace(
  nfts: WalletNft[],
  created: Listing[],
  owned: Array<{ listing: Listing }>,
): WalletNft[] {
  const listingIds = new Set([
    ...created.map((listing) => listing.id),
    ...owned.map((item) => item.listing.id),
  ]);
  return nfts.filter((nft) => !nft.listingId || !listingIds.has(nft.listingId));
}
