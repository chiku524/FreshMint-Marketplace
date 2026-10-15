/**
 * Public treasury transparency: addresses, native balances, and ledger activity.
 * Uses existing platform fee recipients + RPCs already wired for mint networks.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { createPublicClient, formatUnits, http, isAddress, type Hex } from "viem";
import { prisma } from "@/lib/db";
import {
  chainMode,
  getNetwork,
  listNetworks,
  rpcUrlFor,
  type NetworkId,
} from "@/lib/chains/registry";
import { FEATURED_BOOST_USD } from "@/lib/fees/featured-boost";
import { platformFeeRecipients } from "@/lib/fees/platform";
import {
  computeWeekTreasuryProfitUsd,
  getMemoryFridayBuys,
  treasuryReceiveAddress,
  utcFridayWindowId,
  type FridayTreasuryBuyRecord,
} from "@/lib/marketplace/friday-treasury-buy";
import {
  getFridayRafflePublic,
  type FridayRaffleRecord,
} from "@/lib/marketplace/friday-treasury-raffle";

export type TreasuryBalanceRow = {
  id: string;
  label: string;
  vm: string;
  address: string | null;
  symbol: string;
  /** Human-readable native amount, or null when unavailable. */
  balance: string | null;
  explorerUrl: string | null;
};

export type TreasuryActivityKind =
  | "friday_buy"
  | "raffle"
  | "fee"
  | "featured_boost";

export type TreasuryActivityItem = {
  id: string;
  kind: TreasuryActivityKind;
  label: string;
  detail: string;
  at: number;
  amountUsd: number | null;
  href: string | null;
  txHash: string | null;
  network: string | null;
  windowId: string | null;
};

export type TreasuryPublicOverview = {
  mode: ReturnType<typeof chainMode>;
  feeBps: number;
  weekProfitUsd: number;
  windowId: string;
  addresses: {
    evm: string | null;
    solana: string | null;
    btc: string | null;
    operator: string | null;
    operatorSolana: string | null;
  };
  balances: TreasuryBalanceRow[];
  activity: TreasuryActivityItem[];
  raffles: FridayRaffleRecord[];
};

function shorten(addr: string, head = 6, tail = 4): string {
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

function formatNative(raw: bigint, decimals: number, maxFrac = 6): string {
  const full = formatUnits(raw, decimals);
  const [whole, frac = ""] = full.split(".");
  if (!frac) return whole;
  const trimmed = frac.slice(0, maxFrac).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

async function fetchEvmOrSolBalance(
  network: NetworkId,
  address: string,
): Promise<bigint | null> {
  const def = getNetwork(network);
  try {
    if (def.vm === "evm") {
      if (!def.viemChain || !isAddress(address)) return null;
      const client = createPublicClient({
        chain: def.viemChain,
        transport: http(rpcUrlFor(network)),
      });
      return await client.getBalance({ address: address as Hex });
    }
    if (def.vm === "solana") {
      const conn = new Connection(rpcUrlFor("solana"), "confirmed");
      const lamports = await conn.getBalance(new PublicKey(address));
      return BigInt(lamports);
    }
    if (def.vm === "boing") {
      const { getBoingNativeBalance } = await import("@/lib/onchain/boing");
      const bal = await getBoingNativeBalance(address);
      if (!bal.ok || bal.balance == null) return null;
      const whole = BigInt(bal.balance.split(".")[0] || "0");
      return whole * 10n ** 18n;
    }
  } catch {
    return null;
  }
  return null;
}

/** Best-effort BTC satoshi balance via public mempool.space (no key). */
async function fetchBtcSats(address: string): Promise<bigint | null> {
  try {
    const ctrl = AbortSignal.timeout(8_000);
    const res = await fetch(`https://mempool.space/api/address/${address}`, {
      signal: ctrl,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
    };
    const funded = data.chain_stats?.funded_txo_sum ?? 0;
    const spent = data.chain_stats?.spent_txo_sum ?? 0;
    return BigInt(Math.max(0, funded - spent));
  } catch {
    return null;
  }
}

export async function listFridayTreasuryBuysPublic(input?: {
  limit?: number;
  memory?: boolean;
}): Promise<FridayTreasuryBuyRecord[]> {
  const limit = Math.min(Math.max(input?.limit ?? 12, 1), 40);
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  const memory = input?.memory ?? (mode === "memory" || isMemoryMode());
  if (memory) {
    return [...getMemoryFridayBuys()]
      .sort((a, b) => b.windowId.localeCompare(a.windowId))
      .slice(0, limit);
  }
  const rows = await prisma.treasuryFridayBuy.findMany({
    orderBy: { windowId: "desc" },
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
    windowId: row.windowId,
    status: row.status as FridayTreasuryBuyRecord["status"],
    listingId: row.listingId,
    purchaseId: row.purchaseId,
    amountUsd: row.amountUsd,
    chain: row.chain,
    network: row.network,
    reason: row.reason ?? "",
    paymentTxHash: row.paymentTxHash,
    createdAt: row.createdAt.getTime(),
  }));
}

function fridayBuyLabel(status: string): string {
  switch (status) {
    case "purchased":
      return "Friday buy";
    case "queued":
      return "Friday intent";
    case "skipped_no_profit":
      return "Friday skip";
    case "skipped_no_funds":
      return "Friday skip";
    case "skipped_no_listings":
      return "Friday skip";
    default:
      return "Friday";
  }
}

function raffleLabel(status: string, prizeStatus: string): string {
  if (status === "drawn") {
    if (prizeStatus === "claimed" || prizeStatus === "transferred") {
      return "Raffle award";
    }
    if (prizeStatus === "pending_claim" || prizeStatus === "assigned") {
      return "Raffle claim";
    }
    return "Raffle draw";
  }
  return "Raffle";
}

export function buildTreasuryActivity(input: {
  buys: FridayTreasuryBuyRecord[];
  raffles: FridayRaffleRecord[];
  fees: Array<{
    id: string;
    feeTreasuryUsd: number;
    amountUsd: number;
    listingId: string;
    createdAt: number;
    paymentTxHash: string | null;
    payNetwork: string | null;
  }>;
  boosts: Array<{
    id: string;
    title: string;
    featuredBoostedAt: number;
  }>;
}): TreasuryActivityItem[] {
  const items: TreasuryActivityItem[] = [];

  for (const buy of input.buys) {
    const amt =
      buy.amountUsd != null ? `$${buy.amountUsd.toFixed(2)}` : null;
    const detailParts = [
      buy.windowId,
      buy.status.replace(/_/g, " "),
      amt,
      buy.network,
    ].filter(Boolean);
    items.push({
      id: `buy-${buy.id}`,
      kind: "friday_buy",
      label: fridayBuyLabel(buy.status),
      detail: detailParts.join(" · "),
      at: buy.createdAt,
      amountUsd: buy.amountUsd,
      href: buy.listingId ? `/listings/${buy.listingId}` : null,
      txHash: buy.paymentTxHash,
      network: buy.network,
      windowId: buy.windowId,
    });
  }

  for (const raffle of input.raffles) {
    const detailParts = [
      raffle.windowId,
      raffle.status.replace(/_/g, " "),
      raffle.eligibleCount > 0 ? `${raffle.eligibleCount} eligible` : null,
      raffle.prizeStatus !== "n/a" ? `prize ${raffle.prizeStatus}` : null,
    ].filter(Boolean);
    items.push({
      id: `raffle-${raffle.id}`,
      kind: "raffle",
      label: raffleLabel(raffle.status, raffle.prizeStatus),
      detail: detailParts.join(" · "),
      at: raffle.createdAt,
      amountUsd: null,
      href: raffle.listingId ? `/listings/${raffle.listingId}` : null,
      txHash: raffle.claimTxHash,
      network: null,
      windowId: raffle.windowId,
    });
  }

  for (const fee of input.fees) {
    items.push({
      id: `fee-${fee.id}`,
      kind: "fee",
      label: "Sale fee",
      detail: `$${fee.feeTreasuryUsd.toFixed(2)} treasury · sale $${fee.amountUsd.toFixed(2)}`,
      at: fee.createdAt,
      amountUsd: fee.feeTreasuryUsd,
      href: `/listings/${fee.listingId}`,
      txHash: fee.paymentTxHash,
      network: fee.payNetwork,
      windowId: null,
    });
  }

  for (const boost of input.boosts) {
    items.push({
      id: `boost-${boost.id}`,
      kind: "featured_boost",
      label: "Featured boost",
      detail: `$${FEATURED_BOOST_USD} · ${boost.title}`,
      at: boost.featuredBoostedAt,
      amountUsd: FEATURED_BOOST_USD,
      href: `/listings/${boost.id}`,
      txHash: null,
      network: null,
      windowId: null,
    });
  }

  return items.sort((a, b) => b.at - a.at);
}

async function loadFeeMovements(input: {
  limit: number;
  memory: boolean;
}): Promise<
  Array<{
    id: string;
    feeTreasuryUsd: number;
    amountUsd: number;
    listingId: string;
    createdAt: number;
    paymentTxHash: string | null;
    payNetwork: string | null;
  }>
> {
  if (input.memory) {
    const { getMemoryPurchases } = await import("@/lib/data/memory-store");
    return getMemoryPurchases()
      .filter((p) => {
        const status = p.status ?? "completed";
        return (
          (status === "completed" || status === "pending_transfer") &&
          Number(p.feeTreasuryUsd ?? 0) > 0
        );
      })
      .sort((a, b) => (b.soldAt ?? 0) - (a.soldAt ?? 0))
      .slice(0, input.limit)
      .map((p) => ({
        id: p.id,
        feeTreasuryUsd: Number(p.feeTreasuryUsd ?? 0),
        amountUsd: Number(p.amountUsd ?? 0),
        listingId: p.listingId,
        createdAt: p.soldAt ?? 0,
        paymentTxHash: p.paymentTxHash ?? null,
        payNetwork: p.payNetwork ?? null,
      }));
  }

  const rows = await prisma.purchase.findMany({
    where: {
      status: { in: ["completed", "pending_transfer"] },
      feeTreasuryUsd: { gt: 0 },
    },
    orderBy: { createdAt: "desc" },
    take: input.limit,
    select: {
      id: true,
      feeTreasuryUsd: true,
      amountUsd: true,
      listingId: true,
      createdAt: true,
      paymentTxHash: true,
      payNetwork: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    feeTreasuryUsd: Number(r.feeTreasuryUsd),
    amountUsd: Number(r.amountUsd),
    listingId: r.listingId,
    createdAt: r.createdAt.getTime(),
    paymentTxHash: r.paymentTxHash,
    payNetwork: r.payNetwork,
  }));
}

async function loadFeaturedBoosts(input: {
  limit: number;
  memory: boolean;
}): Promise<Array<{ id: string; title: string; featuredBoostedAt: number }>> {
  if (input.memory) {
    const { getDiscoveryEngine } = await import("@/lib/marketplace/service");
    const engine = await getDiscoveryEngine();
    return [...engine.state.listings.values()]
      .filter((l) => l.featuredBoostedAt != null)
      .sort((a, b) => (b.featuredBoostedAt ?? 0) - (a.featuredBoostedAt ?? 0))
      .slice(0, input.limit)
      .map((l) => ({
        id: l.id,
        title: l.title,
        featuredBoostedAt: l.featuredBoostedAt ?? 0,
      }));
  }

  const rows = await prisma.listing.findMany({
    where: { featuredBoostedAt: { not: null } },
    orderBy: { featuredBoostedAt: "desc" },
    take: input.limit,
    select: { id: true, title: true, featuredBoostedAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    featuredBoostedAt: r.featuredBoostedAt?.getTime() ?? 0,
  }));
}

export async function loadTreasuryBalances(): Promise<TreasuryBalanceRow[]> {
  const fees = platformFeeRecipients();
  const rows: TreasuryBalanceRow[] = [];

  await Promise.all(
    listNetworks().map(async (net) => {
      const address = treasuryReceiveAddress(net.id);
      const explorerUrl = address
        ? getNetwork(net.id).explorerAddress(address)
        : null;
      let balance: string | null = null;
      if (address) {
        const raw = await fetchEvmOrSolBalance(net.id, address);
        if (raw != null) {
          balance = `${formatNative(raw, net.decimals)} ${net.nativeSymbol}`;
        }
      }
      rows.push({
        id: net.id,
        label: net.label,
        vm: net.vm,
        address,
        symbol: net.nativeSymbol,
        balance,
        explorerUrl,
      });
    }),
  );

  // Stable network order from registry.
  rows.sort((a, b) => {
    const order = listNetworks().map((n) => n.id);
    return order.indexOf(a.id as NetworkId) - order.indexOf(b.id as NetworkId);
  });

  if (fees.treasuryBtc) {
    const sats = await fetchBtcSats(fees.treasuryBtc);
    rows.push({
      id: "btc",
      label: "Bitcoin",
      vm: "btc",
      address: fees.treasuryBtc,
      symbol: "BTC",
      balance:
        sats != null ? `${formatNative(sats, 8, 8)} BTC` : null,
      explorerUrl: `https://mempool.space/address/${fees.treasuryBtc}`,
    });
  }

  return rows;
}

export async function getTreasuryPublicOverview(input?: {
  activityLimit?: number;
}): Promise<TreasuryPublicOverview> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  const memory = mode === "memory" || isMemoryMode();
  const activityLimit = Math.min(Math.max(input?.activityLimit ?? 24, 1), 60);
  const fees = platformFeeRecipients();
  const windowId =
    utcFridayWindowId(Date.now(), true) ??
    new Date().toISOString().slice(0, 10);

  const [balances, buys, raffles, feeRows, boosts, weekProfitUsd] =
    await Promise.all([
      loadTreasuryBalances(),
      listFridayTreasuryBuysPublic({ limit: 12, memory }),
      getFridayRafflePublic({ limit: 12, memory }),
      loadFeeMovements({ limit: 12, memory }),
      loadFeaturedBoosts({ limit: 8, memory }),
      computeWeekTreasuryProfitUsd({ windowId, memory }),
    ]);

  const activity = buildTreasuryActivity({
    buys,
    raffles,
    fees: feeRows,
    boosts,
  }).slice(0, activityLimit);

  return {
    mode: chainMode(),
    feeBps: 50,
    weekProfitUsd,
    windowId,
    addresses: {
      evm: fees.treasury,
      solana: fees.treasurySolana,
      btc: fees.treasuryBtc,
      operator: fees.operator,
      operatorSolana: fees.operatorSolana,
    },
    balances,
    activity,
    raffles,
  };
}

export function formatTreasuryAddress(addr: string | null | undefined): string {
  if (!addr) return "—";
  return shorten(addr);
}
