/**
 * Friday treasury buys from live Open Lane listings.
 *
 * Policy (fair, documented):
 * - One UTC Friday window (`YYYY-MM-DD`). Idempotent: at most one persisted row.
 * - Eligible: published, minted, not delisted, unsold buy-now (fixed / live timed
 *   window), not an open edition, not the treasury’s own listing/wallets.
 * - Order: SHA-256(windowId + listingId) — deterministic, not newest-first.
 * - Cap: `TREASURY_FRIDAY_BUDGET_USD` (default $50). First candidate whose
 *   list price fits the cap and whose chain treasury native balance covers the
 *   quoted amount.
 * - On-chain pay: only if `TREASURY_EVM_SIGNER_PRIVATE_KEY` /
 *   `TREASURY_SOLANA_SIGNER_SECRET_KEY` derives the platform treasury or
 *   operator address. Safe/Squads treasuries cannot be spent with a single key;
 *   those Fridays record `queued` (intent) without reserving the listing.
 */
import { createHash } from "node:crypto";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { prisma } from "@/lib/db";
import { getNetwork, rpcUrlFor, type NetworkId } from "@/lib/chains/registry";
import type { Listing } from "@/lib/discovery/types";
import { platformFeeRecipients } from "@/lib/fees/platform";
import { listingIsMinted, settlementAddressFor } from "@/lib/marketplace/crypto-purchase";
import { dropWindowFor, primarySupplyCap } from "@/lib/marketplace/drops";
import { listingSellerId } from "@/lib/marketplace/listing-manage";
import { resolveSaleMode } from "@/lib/marketplace/sale-mode";
import { expireStalePendingPurchases, listClosedPrimarySaleIds } from "@/lib/marketplace/sales";
import { purchaseReservesSupply } from "@/lib/marketplace/lifecycle";
import { quoteNativeFromUsd } from "@/lib/onchain/fx";

export const DEFAULT_TREASURY_FRIDAY_BUDGET_USD = 50;
export const TREASURY_FRIDAY_MAX_WORKS = 1;

export type FridayTreasuryBuyStatus =
  | "purchased"
  | "queued"
  | "skipped_no_funds"
  | "skipped_no_listings"
  | "skipped_not_friday"
  | "skipped_error";

export type FridayTreasuryBuyRecord = {
  id: string;
  windowId: string;
  status: FridayTreasuryBuyStatus;
  listingId: string | null;
  purchaseId: string | null;
  amountUsd: number | null;
  chain: string | null;
  network: string | null;
  reason: string;
  paymentTxHash: string | null;
  createdAt: number;
};

export type FridayTreasuryBuyResult = FridayTreasuryBuyRecord & {
  alreadyRan: boolean;
  signerAvailable: boolean;
};

export function fridayBudgetUsd(): number {
  const raw = process.env.TREASURY_FRIDAY_BUDGET_USD?.trim();
  const n = raw ? Number(raw) : DEFAULT_TREASURY_FRIDAY_BUDGET_USD;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TREASURY_FRIDAY_BUDGET_USD;
  return Math.min(n, 10_000);
}

/** UTC Friday date for `now`, or null when it is not Friday (unless `force`). */
export function utcFridayWindowId(now = Date.now(), force = false): string | null {
  const d = new Date(now);
  const day = d.getUTCDay();
  if (day !== 5 && !force) return null;
  const daysSinceFriday = (day + 2) % 7;
  const friday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceFriday),
  );
  return friday.toISOString().slice(0, 10);
}

export function listingFairSortKey(windowId: string, listingId: string): string {
  return createHash("sha256").update(`${windowId}:${listingId}`).digest("hex");
}

export function treasuryAddressSet(): Set<string> {
  const fees = platformFeeRecipients();
  const set = new Set<string>();
  for (const addr of [
    fees.treasury,
    fees.operator,
    fees.treasurySolana,
    fees.operatorSolana,
  ]) {
    if (!addr) continue;
    set.add(addr);
    set.add(addr.toLowerCase());
  }
  return set;
}

export function isTreasuryOwnedListing(
  listing: Listing,
  creatorWallets: Array<{ chain: string; address: string }> | undefined,
  treasuryAddrs: Set<string>,
): boolean {
  if (treasuryAddrs.has(listing.creatorId) || treasuryAddrs.has(listingSellerId(listing))) {
    return true;
  }
  for (const w of creatorWallets ?? []) {
    if (treasuryAddrs.has(w.address) || treasuryAddrs.has(w.address.toLowerCase())) {
      return true;
    }
  }
  return false;
}

export type FridayCandidate = {
  listing: Listing;
  amountUsd: number;
  network: NetworkId;
};

export function selectFridayTreasuryCandidate(input: {
  listings: Iterable<Listing>;
  creators: Map<string, { wallets?: Array<{ chain: string; address: string }> }>;
  soldIds: Set<string>;
  windowId: string;
  budgetUsd: number;
  treasuryAddrs: Set<string>;
  /** Native base units on the listing network (wei / lamports / boing whole units). */
  nativeBalance: (network: NetworkId) => bigint | null;
  now?: number;
}): { candidate: FridayCandidate | null; reason: "ok" | "no_listings" | "no_funds" } {
  const now = input.now ?? Date.now();
  const eligible: FridayCandidate[] = [];

  for (const listing of input.listings) {
    if (listing.delisted) continue;
    if (listing.stage === "draft") continue;
    if (listing.type === "open_edition") continue;
    if (listing.isSecondary) continue;
    if (!listingIsMinted(listing)) continue;
    if (input.soldIds.has(listing.id)) continue;
    const saleMode = resolveSaleMode(listing);
    if (saleMode !== "fixed" && saleMode !== "timed_window") continue;
    const amountUsd = listing.priceUsd ?? 0;
    if (!(amountUsd > 0) || amountUsd > input.budgetUsd) continue;
    const cap = primarySupplyCap(listing);
    if (cap !== 1) continue;
    const window = dropWindowFor(listing, null, now);
    if (window.state === "upcoming" || window.state === "ended") continue;
    const creator = input.creators.get(listing.creatorId);
    if (isTreasuryOwnedListing(listing, creator?.wallets, input.treasuryAddrs)) {
      continue;
    }
    const network = (listing.network ||
      (listing.chain === "solana"
        ? "solana"
        : listing.chain === "boing"
          ? "boing"
          : "ethereum")) as NetworkId;
    eligible.push({ listing, amountUsd, network });
  }

  if (eligible.length === 0) {
    return { candidate: null, reason: "no_listings" };
  }

  eligible.sort((a, b) =>
    listingFairSortKey(input.windowId, a.listing.id).localeCompare(
      listingFairSortKey(input.windowId, b.listing.id),
    ),
  );

  let sawUnaffordable = false;
  for (const row of eligible) {
    const quote = quoteNativeFromUsd(row.amountUsd, row.listing.chain);
    const bal = input.nativeBalance(row.network);
    if (bal == null || bal < quote.baseUnits) {
      sawUnaffordable = true;
      continue;
    }
    return { candidate: row, reason: "ok" };
  }

  return { candidate: null, reason: sawUnaffordable ? "no_funds" : "no_listings" };
}

type MemoryFridayBuy = FridayTreasuryBuyRecord;

const fridayMemory = globalThis as unknown as {
  __freshmintFridayBuys?: MemoryFridayBuy[];
};

export function getMemoryFridayBuys(): MemoryFridayBuy[] {
  if (!fridayMemory.__freshmintFridayBuys) {
    fridayMemory.__freshmintFridayBuys = [];
  }
  return fridayMemory.__freshmintFridayBuys;
}

export function resetMemoryFridayBuysForTests(): void {
  fridayMemory.__freshmintFridayBuys = [];
}

function toRecord(row: {
  id: string;
  windowId: string;
  status: string;
  listingId?: string | null;
  purchaseId?: string | null;
  amountUsd?: number | null;
  chain?: string | null;
  network?: string | null;
  reason?: string | null;
  paymentTxHash?: string | null;
  createdAt: Date | number;
}): FridayTreasuryBuyRecord {
  return {
    id: row.id,
    windowId: row.windowId,
    status: row.status as FridayTreasuryBuyStatus,
    listingId: row.listingId ?? null,
    purchaseId: row.purchaseId ?? null,
    amountUsd: row.amountUsd ?? null,
    chain: row.chain ?? null,
    network: row.network ?? null,
    reason: row.reason ?? "",
    paymentTxHash: row.paymentTxHash ?? null,
    createdAt:
      typeof row.createdAt === "number" ? row.createdAt : row.createdAt.getTime(),
  };
}

async function persistBuy(
  memory: boolean,
  data: Omit<FridayTreasuryBuyRecord, "id" | "createdAt"> & { id?: string },
): Promise<FridayTreasuryBuyRecord> {
  const now = Date.now();
  if (memory) {
    const existing = getMemoryFridayBuys().find((r) => r.windowId === data.windowId);
    if (existing) return existing;
    const row: MemoryFridayBuy = {
      id: data.id ?? `friday-buy-${data.windowId}`,
      windowId: data.windowId,
      status: data.status,
      listingId: data.listingId,
      purchaseId: data.purchaseId,
      amountUsd: data.amountUsd,
      chain: data.chain,
      network: data.network,
      reason: data.reason,
      paymentTxHash: data.paymentTxHash,
      createdAt: now,
    };
    getMemoryFridayBuys().push(row);
    return row;
  }

  try {
    const created = await prisma.treasuryFridayBuy.create({
      data: {
        windowId: data.windowId,
        status: data.status,
        listingId: data.listingId,
        purchaseId: data.purchaseId,
        amountUsd: data.amountUsd ?? undefined,
        chain: data.chain ?? undefined,
        network: data.network ?? undefined,
        reason: data.reason,
        paymentTxHash: data.paymentTxHash,
      },
    });
    return toRecord(created);
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "";
    if (code === "P2002") {
      const existing = await prisma.treasuryFridayBuy.findUnique({
        where: { windowId: data.windowId },
      });
      if (existing) return toRecord(existing);
    }
    throw err;
  }
}

async function loadExisting(
  memory: boolean,
  windowId: string,
): Promise<FridayTreasuryBuyRecord | null> {
  if (memory) {
    return getMemoryFridayBuys().find((r) => r.windowId === windowId) ?? null;
  }
  const row = await prisma.treasuryFridayBuy.findUnique({
    where: { windowId },
  });
  return row ? toRecord(row) : null;
}

export function treasuryReceiveAddress(network: NetworkId): string | null {
  const fees = platformFeeRecipients();
  const vm = getNetwork(network).vm;
  if (vm === "solana") return fees.treasurySolana || fees.operatorSolana;
  return fees.treasury || fees.operator;
}

type EvmSigner = { address: string; key: Hex };

function loadTreasuryEvmSigner(): EvmSigner | null {
  const key = process.env.TREASURY_EVM_SIGNER_PRIVATE_KEY?.trim();
  if (!key) return null;
  try {
    const account = privateKeyToAccount(key as Hex);
    const allowed = treasuryAddressSet();
    if (!allowed.has(account.address) && !allowed.has(account.address.toLowerCase())) {
      return null;
    }
    return { address: account.address, key: key as Hex };
  } catch {
    return null;
  }
}

function loadTreasurySolanaSigner(): { address: string; keypair: Keypair } | null {
  const raw = process.env.TREASURY_SOLANA_SIGNER_SECRET_KEY?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as number[];
    const keypair = Keypair.fromSecretKey(Uint8Array.from(parsed));
    const address = keypair.publicKey.toBase58();
    const allowed = treasuryAddressSet();
    if (!allowed.has(address)) return null;
    return { address, keypair };
  } catch {
    return null;
  }
}

export function fridaySignerAvailable(): boolean {
  return Boolean(loadTreasuryEvmSigner() || loadTreasurySolanaSigner());
}

async function fetchNativeBalance(network: NetworkId): Promise<bigint | null> {
  const addr = treasuryReceiveAddress(network);
  if (!addr) return null;
  const def = getNetwork(network);
  try {
    if (def.vm === "evm") {
      if (!def.viemChain || !isAddress(addr)) return null;
      const client = createPublicClient({
        chain: def.viemChain,
        transport: http(rpcUrlFor(network)),
      });
      return await client.getBalance({ address: addr as Hex });
    }
    if (def.vm === "solana") {
      const conn = new Connection(rpcUrlFor("solana"), "confirmed");
      const lamports = await conn.getBalance(new PublicKey(addr));
      return BigInt(lamports);
    }
    if (def.vm === "boing") {
      const { getBoingNativeBalance } = await import("@/lib/onchain/boing");
      const bal = await getBoingNativeBalance(addr);
      if (!bal.ok || bal.balance == null) return null;
      // Boing reports whole-unit decimal strings; compare against 18-decimal quotes.
      const whole = BigInt(bal.balance.split(".")[0] || "0");
      return whole * 10n ** 18n;
    }
  } catch {
    return null;
  }
  return null;
}

async function sendTreasuryPayment(input: {
  network: NetworkId;
  amountUsd: number;
  chain: Listing["chain"];
  toAddress: string;
}): Promise<{ txHash: string; fromAddress: string } | null> {
  const quote = quoteNativeFromUsd(input.amountUsd, input.chain);
  const def = getNetwork(input.network);
  if (def.vm === "evm") {
    const signer = loadTreasuryEvmSigner();
    if (!signer || !def.viemChain || !isAddress(input.toAddress)) return null;
    const account = privateKeyToAccount(signer.key);
    const wallet = createWalletClient({
      account,
      chain: def.viemChain,
      transport: http(rpcUrlFor(input.network)),
    });
    const hash = await wallet.sendTransaction({
      to: input.toAddress as Hex,
      value: quote.baseUnits,
    });
    return { txHash: hash, fromAddress: signer.address };
  }
  if (def.vm === "solana") {
    const signer = loadTreasurySolanaSigner();
    if (!signer) return null;
    const conn = new Connection(rpcUrlFor("solana"), "confirmed");
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: signer.keypair.publicKey,
        toPubkey: new PublicKey(input.toAddress),
        lamports: Number(quote.baseUnits),
      }),
    );
    tx.feePayer = signer.keypair.publicKey;
    const { blockhash } = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.sign(signer.keypair);
    const txHash = await conn.sendRawTransaction(tx.serialize());
    return { txHash, fromAddress: signer.address };
  }
  return null;
}

export async function runFridayTreasuryBuys(input?: {
  now?: number;
  force?: boolean;
  /** Injected balances (tests). Missing networks fall through to RPC unless skipFetch. */
  balances?: Partial<Record<NetworkId, bigint | null>>;
  skipBalanceFetch?: boolean;
}): Promise<FridayTreasuryBuyResult> {
  const now = input?.now ?? Date.now();
  const force = Boolean(input?.force);
  const signerAvailable = fridaySignerAvailable();
  const windowId = utcFridayWindowId(now, force);
  if (!windowId) {
    return {
      id: "friday-skip-not-friday",
      windowId: "",
      status: "skipped_not_friday",
      listingId: null,
      purchaseId: null,
      amountUsd: null,
      chain: null,
      network: null,
      reason: "not_friday_utc",
      paymentTxHash: null,
      createdAt: now,
      alreadyRan: false,
      signerAvailable,
    };
  }

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  const memory = mode === "memory" || isMemoryMode();

  const existing = await loadExisting(memory, windowId);
  if (existing) {
    return { ...existing, alreadyRan: true, signerAvailable };
  }

  const { getDiscoveryEngine, purchaseListing } = await import(
    "@/lib/marketplace/service"
  );
  const engine = await getDiscoveryEngine();
  const soldIds = await listClosedPrimarySaleIds();
  await expireStalePendingPurchases(now);
  const reserved = new Set<string>();
  if (memory) {
    const { getMemoryPurchases } = await import("@/lib/data/memory-store");
    for (const p of getMemoryPurchases()) {
      if (purchaseReservesSupply(p)) reserved.add(p.listingId);
    }
  } else {
    const rows = await prisma.purchase.findMany({
      where: {
        status: { in: ["completed", "pending_transfer", "pending_payment"] },
      },
      select: { listingId: true, status: true, createdAt: true, txHash: true },
    });
    for (const p of rows) {
      if (purchaseReservesSupply(p)) reserved.add(p.listingId);
    }
  }
  const taken = new Set([...soldIds, ...reserved]);

  const injected = input?.balances ?? {};
  const cache = new Map<NetworkId, bigint | null>();
  const networks = new Set<NetworkId>();
  for (const listing of engine.state.listings.values()) {
    if (listing.network) networks.add(listing.network as NetworkId);
  }
  if (!input?.skipBalanceFetch) {
    for (const network of networks) {
      if (network in injected) continue;
      cache.set(network, await fetchNativeBalance(network));
    }
  }

  const picked = selectFridayTreasuryCandidate({
    listings: engine.state.listings.values(),
    creators: engine.state.creators,
    soldIds: taken,
    windowId,
    budgetUsd: fridayBudgetUsd(),
    treasuryAddrs: treasuryAddressSet(),
    nativeBalance: (network) => {
      if (network in injected) {
        const v = injected[network];
        return v === undefined ? null : v;
      }
      return cache.get(network) ?? null;
    },
    now,
  });

  if (!picked.candidate) {
    const status: FridayTreasuryBuyStatus =
      picked.reason === "no_funds" ? "skipped_no_funds" : "skipped_no_listings";
    const row = await persistBuy(memory, {
      windowId,
      status,
      listingId: null,
      purchaseId: null,
      amountUsd: null,
      chain: null,
      network: null,
      reason: picked.reason,
      paymentTxHash: null,
    });
    return { ...row, alreadyRan: false, signerAvailable };
  }

  const { listing, amountUsd, network } = picked.candidate;
  const receive = treasuryReceiveAddress(network);
  const settlement = settlementAddressFor(network);

  let paymentTxHash: string | null = null;
  let fromAddress = receive;
  let purchaseId: string | null = null;
  let status: FridayTreasuryBuyStatus = "queued";
  let reason =
    "intent_recorded_no_treasury_signer — Safe/Squads cannot be spent with a single key";

  const canPayThisChain =
    (getNetwork(network).vm === "evm" && loadTreasuryEvmSigner()) ||
    (getNetwork(network).vm === "solana" && loadTreasurySolanaSigner());

  if (canPayThisChain && receive) {
    try {
      const sent = await sendTreasuryPayment({
        network,
        amountUsd,
        chain: listing.chain,
        toAddress: settlement,
      });
      if (sent) {
        paymentTxHash = sent.txHash;
        fromAddress = sent.fromAddress;
        const { upsertUserFromWallet } = await import("@/lib/auth/wallet");
        const buyer = await upsertUserFromWallet({
          chain: listing.chain === "solana" ? "solana" : listing.chain === "boing" ? "boing" : "evm",
          address: receive,
          displayName: "FreshMint Treasury",
        });
        const bought = await purchaseListing({
          listingId: listing.id,
          buyerId: buyer.id,
          payNetwork: network,
          buyerPaymentAddress: fromAddress,
          buyerReceiveAddress: receive,
          amountUsd,
          paymentTxHash,
        });
        if (bought.ok) {
          purchaseId = bought.purchaseId;
          status = "purchased";
          reason = "paid_via_treasury_signer_existing_purchase_path";
        } else {
          status = "queued";
          reason = `payment_sent_purchase_failed:${bought.error}`;
        }
      }
    } catch (err) {
      status = "queued";
      reason = `signer_send_failed:${err instanceof Error ? err.message : "error"}`;
    }
  }

  const row = await persistBuy(memory, {
    windowId,
    status,
    listingId: listing.id,
    purchaseId,
    amountUsd,
    chain: listing.chain,
    network,
    reason,
    paymentTxHash,
  });
  return { ...row, alreadyRan: false, signerAvailable };
}
