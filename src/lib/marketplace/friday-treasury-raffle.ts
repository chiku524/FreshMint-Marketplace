/**
 * Friday treasury raffle — active creators/collectors auto-enter; winner
 * receives that Friday’s treasury Open Lane floor buy (or a durable claim).
 *
 * Eligibility (same lookback as weekly treasury profit: previous Friday 00:00 UTC
 * through this Friday run):
 * - Creator: minted or listed a non-draft work in the window
 * - Collector: bought, made an offer, or placed a bid in the window
 * - Excluded: flagged / wash-cluster users, accounts with no linked wallet,
 *   platform treasury/operator wallets, and the seller of the purchased listing
 *
 * Draw: SHA-256(windowId + ":" + userId), ascending — deterministic, auditable.
 * Kill switch: TREASURY_FRIDAY_RAFFLE_DISABLED=1
 */
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Listing } from "@/lib/discovery/types";
import {
  fridayProfitWindowMs,
  treasuryAddressSet,
} from "@/lib/marketplace/friday-treasury-buy";
import { listingSellerId } from "@/lib/marketplace/listing-manage";

export const FRIDAY_RAFFLE_ELIGIBILITY_COPY =
  "Auto-entered when you mint, list, buy, offer, or bid during the week before Friday (UTC). Flagged accounts, empty wallets, and treasury addresses are excluded.";

export type FridayRaffleActivityKind =
  | "minted"
  | "listed"
  | "bought"
  | "offer"
  | "bid";

export type FridayRaffleStatus =
  | "drawn"
  | "skipped_no_eligible"
  | "skipped_no_buy"
  | "skipped_no_profit"
  | "skipped_disabled";

export type FridayRafflePrizeStatus =
  | "n/a"
  | "pending_claim"
  | "assigned"
  | "claimed"
  | "transferred";

export type FridayRaffleEligible = {
  userId: string;
  kinds: FridayRaffleActivityKind[];
  displayName: string | null;
};

export type FridayRaffleRecord = {
  id: string;
  windowId: string;
  status: FridayRaffleStatus;
  fridayBuyId: string | null;
  listingId: string | null;
  purchaseId: string | null;
  winnerUserId: string | null;
  eligibleCount: number;
  prizeStatus: FridayRafflePrizeStatus;
  claimAddress: string | null;
  claimTxHash: string | null;
  claimedAt: number | null;
  winnerKinds: FridayRaffleActivityKind[];
  reason: string;
  createdAt: number;
};

export function fridayRaffleDisabled(): boolean {
  const raw = process.env.TREASURY_FRIDAY_RAFFLE_DISABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function raffleSortKey(windowId: string, userId: string): string {
  return createHash("sha256").update(`${windowId}:${userId}`).digest("hex");
}

export function pickFridayRaffleWinner(
  windowId: string,
  eligible: FridayRaffleEligible[],
  excludeUserIds: Set<string>,
): FridayRaffleEligible | null {
  const pool = eligible.filter((e) => !excludeUserIds.has(e.userId));
  if (pool.length === 0) return null;
  pool.sort((a, b) =>
    raffleSortKey(windowId, a.userId).localeCompare(
      raffleSortKey(windowId, b.userId),
    ),
  );
  return pool[0] ?? null;
}

function inWindow(at: number, startMs: number, endMs: number): boolean {
  return at >= startMs && at < endMs;
}

function addKind(
  map: Map<string, Set<FridayRaffleActivityKind>>,
  userId: string,
  kind: FridayRaffleActivityKind,
) {
  if (!userId) return;
  let set = map.get(userId);
  if (!set) {
    set = new Set();
    map.set(userId, set);
  }
  set.add(kind);
}

export async function collectFridayRaffleEligible(input: {
  windowId: string;
  now?: number;
  memory?: boolean;
}): Promise<FridayRaffleEligible[]> {
  const now = input.now ?? Date.now();
  const { startMs, endMs } = fridayProfitWindowMs(input.windowId, now);
  const kindsByUser = new Map<string, Set<FridayRaffleActivityKind>>();
  const names = new Map<string, string>();
  const walletsByUser = new Map<string, string[]>();
  const flagged = new Set<string>();
  const treasury = treasuryAddressSet();

  if (input.memory) {
    const { getMemoryEngine, getMemoryPurchases } = await import(
      "@/lib/data/memory-store"
    );
    const engine = getMemoryEngine();
    for (const [id, c] of engine.state.creators) {
      names.set(id, c.displayName);
      walletsByUser.set(
        id,
        (c.wallets ?? []).map((w) => w.address),
      );
      if (c.flagged || c.washCluster) flagged.add(id);
    }
    for (const listing of engine.state.listings.values()) {
      const at = listing.softLaunchedAt ?? listing.createdAt;
      if (!inWindow(at, startMs, endMs)) continue;
      if (listing.stage === "draft") continue;
      addKind(kindsByUser, listing.creatorId, "listed");
      if (listing.mintTxHash) {
        addKind(kindsByUser, listing.creatorId, "minted");
      }
    }
    for (const p of getMemoryPurchases()) {
      const status = p.status ?? "completed";
      if (status !== "completed" && status !== "pending_transfer") continue;
      if (!inWindow(p.soldAt ?? 0, startMs, endMs)) continue;
      addKind(kindsByUser, p.buyerId, "bought");
    }
    const { getMemoryBids } = await import("@/lib/marketplace/english-auction");
    for (const bid of getMemoryBids()) {
      if (!inWindow(bid.createdAt, startMs, endMs)) continue;
      addKind(kindsByUser, bid.bidderId, "bid");
    }
    const { listMemoryOffersForRaffle } = await import(
      "@/lib/marketplace/offers"
    );
    for (const offer of listMemoryOffersForRaffle()) {
      if (!inWindow(offer.createdAt, startMs, endMs)) continue;
      addKind(kindsByUser, offer.offererId, "offer");
    }
  } else {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        displayName: true,
        flagged: true,
        washCluster: true,
        wallets: { select: { address: true } },
      },
    });
    for (const u of users) {
      names.set(u.id, u.displayName);
      walletsByUser.set(
        u.id,
        u.wallets.map((w) => w.address),
      );
      if (u.flagged || u.washCluster) flagged.add(u.id);
    }

    const listings = await prisma.listing.findMany({
      where: {
        stage: { not: "draft" },
        OR: [
          { createdAt: { gte: new Date(startMs), lt: new Date(endMs) } },
          { softLaunchedAt: { gte: new Date(startMs), lt: new Date(endMs) } },
        ],
      },
      select: {
        creatorId: true,
        mintTxHash: true,
        softLaunchedAt: true,
        createdAt: true,
      },
    });
    for (const l of listings) {
      const at = (l.softLaunchedAt ?? l.createdAt).getTime();
      if (!inWindow(at, startMs, endMs)) continue;
      addKind(kindsByUser, l.creatorId, "listed");
      if (l.mintTxHash) addKind(kindsByUser, l.creatorId, "minted");
    }

    const purchases = await prisma.purchase.findMany({
      where: {
        status: { in: ["completed", "pending_transfer"] },
        createdAt: { gte: new Date(startMs), lt: new Date(endMs) },
      },
      select: { buyerId: true },
    });
    for (const p of purchases) addKind(kindsByUser, p.buyerId, "bought");

    const offers = await prisma.offer.findMany({
      where: { createdAt: { gte: new Date(startMs), lt: new Date(endMs) } },
      select: { offererId: true },
    });
    for (const o of offers) addKind(kindsByUser, o.offererId, "offer");

    const bids = await prisma.bid.findMany({
      where: { createdAt: { gte: new Date(startMs), lt: new Date(endMs) } },
      select: { bidderId: true },
    });
    for (const b of bids) addKind(kindsByUser, b.bidderId, "bid");
  }

  const out: FridayRaffleEligible[] = [];
  for (const [userId, kinds] of kindsByUser) {
    if (flagged.has(userId)) continue;
    const wallets = walletsByUser.get(userId) ?? [];
    if (wallets.length === 0) continue;
    const onlyTreasury = wallets.every(
      (a) => treasury.has(a) || treasury.has(a.toLowerCase()),
    );
    if (onlyTreasury) continue;
    out.push({
      userId,
      kinds: [...kinds].sort(),
      displayName: names.get(userId) ?? null,
    });
  }
  out.sort((a, b) => a.userId.localeCompare(b.userId));
  return out;
}

export function winnerReceiveAddress(input: {
  listing: Listing;
  winnerWallets: Array<{ chain: string; address: string }>;
  treasuryFallback: string | null;
}): { address: string | null; fromWinner: boolean } {
  const chain = input.listing.chain;
  const match = input.winnerWallets.find((w) => w.chain === chain);
  if (match?.address) return { address: match.address, fromWinner: true };
  return { address: input.treasuryFallback, fromWinner: false };
}

type MemoryRaffle = FridayRaffleRecord;

const raffleMemory = globalThis as unknown as {
  __freshmintFridayRaffles?: MemoryRaffle[];
};

export function getMemoryFridayRaffles(): MemoryRaffle[] {
  if (!raffleMemory.__freshmintFridayRaffles) {
    raffleMemory.__freshmintFridayRaffles = [];
  }
  return raffleMemory.__freshmintFridayRaffles;
}

export function resetMemoryFridayRafflesForTests(): void {
  raffleMemory.__freshmintFridayRaffles = [];
}

function parseKinds(json: string | null | undefined): FridayRaffleActivityKind[] {
  try {
    const parsed = JSON.parse(json || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (k): k is FridayRaffleActivityKind =>
        typeof k === "string" &&
        ["minted", "listed", "bought", "offer", "bid"].includes(k),
    );
  } catch {
    return [];
  }
}

function toRecord(row: {
  id: string;
  windowId: string;
  status: string;
  fridayBuyId?: string | null;
  listingId?: string | null;
  purchaseId?: string | null;
  winnerUserId?: string | null;
  eligibleCount?: number | null;
  prizeStatus?: string | null;
  claimAddress?: string | null;
  claimTxHash?: string | null;
  claimedAt?: Date | number | null;
  winnerKindsJson?: string | null;
  reason?: string | null;
  createdAt: Date | number;
}): FridayRaffleRecord {
  return {
    id: row.id,
    windowId: row.windowId,
    status: row.status as FridayRaffleStatus,
    fridayBuyId: row.fridayBuyId ?? null,
    listingId: row.listingId ?? null,
    purchaseId: row.purchaseId ?? null,
    winnerUserId: row.winnerUserId ?? null,
    eligibleCount: row.eligibleCount ?? 0,
    prizeStatus: (row.prizeStatus as FridayRafflePrizeStatus) ?? "n/a",
    claimAddress: row.claimAddress ?? null,
    claimTxHash: row.claimTxHash ?? null,
    claimedAt:
      row.claimedAt == null
        ? null
        : typeof row.claimedAt === "number"
          ? row.claimedAt
          : row.claimedAt.getTime(),
    winnerKinds: parseKinds(row.winnerKindsJson),
    reason: row.reason ?? "",
    createdAt:
      typeof row.createdAt === "number" ? row.createdAt : row.createdAt.getTime(),
  };
}

async function loadExistingRaffle(
  memory: boolean,
  windowId: string,
): Promise<FridayRaffleRecord | null> {
  if (memory) {
    return getMemoryFridayRaffles().find((r) => r.windowId === windowId) ?? null;
  }
  const row = await prisma.treasuryFridayRaffle.findUnique({
    where: { windowId },
  });
  return row ? toRecord(row) : null;
}

async function persistRaffle(
  memory: boolean,
  data: Omit<FridayRaffleRecord, "id" | "createdAt" | "winnerKinds"> & {
    id?: string;
    winnerKinds: FridayRaffleActivityKind[];
  },
): Promise<FridayRaffleRecord> {
  const now = Date.now();
  const winnerKindsJson = JSON.stringify(data.winnerKinds);
  if (memory) {
    const existing = getMemoryFridayRaffles().find(
      (r) => r.windowId === data.windowId,
    );
    if (existing) return existing;
    const row: MemoryRaffle = {
      id: data.id ?? `friday-raffle-${data.windowId}`,
      windowId: data.windowId,
      status: data.status,
      fridayBuyId: data.fridayBuyId,
      listingId: data.listingId,
      purchaseId: data.purchaseId,
      winnerUserId: data.winnerUserId,
      eligibleCount: data.eligibleCount,
      prizeStatus: data.prizeStatus,
      claimAddress: data.claimAddress,
      claimTxHash: data.claimTxHash,
      claimedAt: data.claimedAt,
      winnerKinds: data.winnerKinds,
      reason: data.reason,
      createdAt: now,
    };
    getMemoryFridayRaffles().push(row);
    return row;
  }

  try {
    const created = await prisma.treasuryFridayRaffle.create({
      data: {
        windowId: data.windowId,
        status: data.status,
        fridayBuyId: data.fridayBuyId,
        listingId: data.listingId,
        purchaseId: data.purchaseId,
        winnerUserId: data.winnerUserId,
        eligibleCount: data.eligibleCount,
        prizeStatus: data.prizeStatus,
        claimAddress: data.claimAddress,
        claimTxHash: data.claimTxHash,
        claimedAt: data.claimedAt ? new Date(data.claimedAt) : null,
        winnerKindsJson,
        reason: data.reason,
      },
    });
    return toRecord(created);
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "";
    if (code === "P2002") {
      const existing = await prisma.treasuryFridayRaffle.findUnique({
        where: { windowId: data.windowId },
      });
      if (existing) return toRecord(existing);
    }
    throw err;
  }
}

export async function runFridayTreasuryRaffle(input: {
  windowId: string;
  memory: boolean;
  fridayBuyId: string | null;
  buyStatus: string;
  listingId: string | null;
  purchaseId: string | null;
  listing?: Listing | null;
  weekProfitUsd: number;
  now?: number;
}): Promise<FridayRaffleRecord> {
  const existing = await loadExistingRaffle(input.memory, input.windowId);
  if (existing) return existing;

  if (fridayRaffleDisabled()) {
    return persistRaffle(input.memory, {
      windowId: input.windowId,
      status: "skipped_disabled",
      fridayBuyId: input.fridayBuyId,
      listingId: input.listingId,
      purchaseId: input.purchaseId,
      winnerUserId: null,
      eligibleCount: 0,
      prizeStatus: "n/a",
      claimAddress: null,
      claimTxHash: null,
      claimedAt: null,
      winnerKinds: [],
      reason: "TREASURY_FRIDAY_RAFFLE_DISABLED",
    });
  }

  if (!(input.weekProfitUsd > 0)) {
    return persistRaffle(input.memory, {
      windowId: input.windowId,
      status: "skipped_no_profit",
      fridayBuyId: input.fridayBuyId,
      listingId: null,
      purchaseId: null,
      winnerUserId: null,
      eligibleCount: 0,
      prizeStatus: "n/a",
      claimAddress: null,
      claimTxHash: null,
      claimedAt: null,
      winnerKinds: [],
      reason: `week_profit_usd=${input.weekProfitUsd}`,
    });
  }

  const buyOk =
    input.buyStatus === "purchased" || input.buyStatus === "queued";
  if (!buyOk || !input.listingId) {
    return persistRaffle(input.memory, {
      windowId: input.windowId,
      status: "skipped_no_buy",
      fridayBuyId: input.fridayBuyId,
      listingId: input.listingId,
      purchaseId: input.purchaseId,
      winnerUserId: null,
      eligibleCount: 0,
      prizeStatus: "n/a",
      claimAddress: null,
      claimTxHash: null,
      claimedAt: null,
      winnerKinds: [],
      reason: `buy_status=${input.buyStatus}`,
    });
  }

  const eligible = await collectFridayRaffleEligible({
    windowId: input.windowId,
    now: input.now,
    memory: input.memory,
  });

  const exclude = new Set<string>();
  if (input.listing) {
    exclude.add(input.listing.creatorId);
    exclude.add(listingSellerId(input.listing));
  }

  const winner = pickFridayRaffleWinner(input.windowId, eligible, exclude);
  if (!winner) {
    return persistRaffle(input.memory, {
      windowId: input.windowId,
      status: "skipped_no_eligible",
      fridayBuyId: input.fridayBuyId,
      listingId: input.listingId,
      purchaseId: input.purchaseId,
      winnerUserId: null,
      eligibleCount: eligible.length,
      prizeStatus: "n/a",
      claimAddress: null,
      claimTxHash: null,
      claimedAt: null,
      winnerKinds: [],
      reason: eligible.length
        ? "all_eligible_excluded_as_seller"
        : "no_active_users",
    });
  }

  let prizeStatus: FridayRafflePrizeStatus = "pending_claim";
  let claimAddress: string | null = null;
  if (input.buyStatus === "purchased" && input.purchaseId) {
    // Purchase path may have assigned winner as buyer already.
    prizeStatus = "assigned";
  }

  if (input.listing) {
    let winnerWallets: Array<{ chain: string; address: string }> = [];
    if (input.memory) {
      const { getMemoryEngine } = await import("@/lib/data/memory-store");
      const c = getMemoryEngine().state.creators.get(winner.userId);
      winnerWallets = c?.wallets ?? [];
    } else {
      const wallets = await prisma.wallet.findMany({
        where: { userId: winner.userId },
        select: { chain: true, address: true },
      });
      winnerWallets = wallets;
    }
    const recv = winnerReceiveAddress({
      listing: input.listing,
      winnerWallets,
      treasuryFallback: null,
    });
    if (recv.fromWinner && recv.address) {
      claimAddress = recv.address;
      if (input.buyStatus === "purchased") prizeStatus = "assigned";
    }
  }

  const row = await persistRaffle(input.memory, {
    windowId: input.windowId,
    status: "drawn",
    fridayBuyId: input.fridayBuyId,
    listingId: input.listingId,
    purchaseId: input.purchaseId,
    winnerUserId: winner.userId,
    eligibleCount: eligible.length,
    prizeStatus,
    claimAddress,
    claimTxHash: null,
    claimedAt: null,
    winnerKinds: winner.kinds,
    reason: `eligible=${eligible.length};kinds=${winner.kinds.join("+")}`,
  });

  try {
    const { createNotification, notificationDedupeKey } = await import(
      "@/lib/notifications"
    );
    await createNotification({
      userId: winner.userId,
      type: "friday_raffle_win",
      title: "Friday treasury raffle",
      body: "You won this week’s treasury Open Lane buy. Claim it from your profile if transfer is still pending.",
      href: "/me#friday-raffle",
      dedupeKey: notificationDedupeKey("friday_raffle_win", input.windowId),
      payload: {
        windowId: input.windowId,
        listingId: input.listingId,
        purchaseId: input.purchaseId,
      },
      now: input.now,
    });
  } catch {
    // Non-fatal — raffle row is the source of truth.
  }

  return row;
}

export async function getFridayRafflePublic(input?: {
  limit?: number;
  memory?: boolean;
}): Promise<FridayRaffleRecord[]> {
  const limit = Math.min(Math.max(input?.limit ?? 8, 1), 40);
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  const memory = input?.memory ?? (mode === "memory" || isMemoryMode());
  if (memory) {
    return [...getMemoryFridayRaffles()]
      .sort((a, b) => b.windowId.localeCompare(a.windowId))
      .slice(0, limit);
  }
  const rows = await prisma.treasuryFridayRaffle.findMany({
    orderBy: { windowId: "desc" },
    take: limit,
  });
  return rows.map(toRecord);
}

export async function getFridayRaffleForUser(
  userId: string,
  input?: { memory?: boolean },
): Promise<{
  eligibleThisWeek: boolean;
  kinds: FridayRaffleActivityKind[];
  wins: FridayRaffleRecord[];
  latest: FridayRaffleRecord | null;
}> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  const memory = input?.memory ?? (mode === "memory" || isMemoryMode());
  const now = Date.now();
  const { utcFridayWindowId } = await import(
    "@/lib/marketplace/friday-treasury-buy"
  );
  const windowId =
    utcFridayWindowId(now, true) ?? new Date(now).toISOString().slice(0, 10);
  const eligible = await collectFridayRaffleEligible({
    windowId,
    now,
    memory,
  });
  const me = eligible.find((e) => e.userId === userId);
  const all = await getFridayRafflePublic({ limit: 20, memory });
  const wins = all.filter((r) => r.winnerUserId === userId);
  return {
    eligibleThisWeek: Boolean(me),
    kinds: me?.kinds ?? [],
    wins,
    latest: all[0] ?? null,
  };
}

export async function claimFridayRafflePrize(input: {
  windowId: string;
  userId: string;
  claimAddress: string;
}): Promise<
  | { ok: true; raffle: FridayRaffleRecord }
  | { ok: false; error: string; status?: number }
> {
  const address = input.claimAddress.trim();
  if (!address) {
    return { ok: false, error: "invalid_address", status: 400 };
  }

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, updateMemoryPurchase } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();
  const memory = mode === "memory" || isMemoryMode();

  let raffle = await loadExistingRaffle(memory, input.windowId);
  if (!raffle) return { ok: false, error: "not_found", status: 404 };
  if (raffle.winnerUserId !== input.userId) {
    return { ok: false, error: "not_winner", status: 403 };
  }
  if (raffle.status !== "drawn") {
    return { ok: false, error: "not_drawn", status: 400 };
  }
  if (
    raffle.prizeStatus === "transferred" ||
    raffle.prizeStatus === "claimed"
  ) {
    return { ok: true, raffle };
  }

  // Verify address belongs to the winner.
  let ownsWallet = false;
  if (memory) {
    const { getMemoryEngine } = await import("@/lib/data/memory-store");
    const c = getMemoryEngine().state.creators.get(input.userId);
    ownsWallet = Boolean(
      c?.wallets.some(
        (w) =>
          w.address === address ||
          w.address.toLowerCase() === address.toLowerCase(),
      ),
    );
  } else {
    const wallet = await prisma.wallet.findFirst({
      where: {
        userId: input.userId,
        OR: [
          { address },
          { address: address.toLowerCase() },
        ],
      },
    });
    ownsWallet = Boolean(wallet);
  }
  if (!ownsWallet) {
    return { ok: false, error: "wallet_not_linked", status: 400 };
  }

  const now = Date.now();
  if (memory) {
    const rows = getMemoryFridayRaffles();
    const idx = rows.findIndex((r) => r.windowId === input.windowId);
    if (idx < 0) return { ok: false, error: "not_found", status: 404 };
    rows[idx] = {
      ...rows[idx],
      prizeStatus: "claimed",
      claimAddress: address,
      claimedAt: now,
      reason: `${rows[idx].reason};claimed_awaiting_transfer`,
    };
    if (rows[idx].purchaseId) {
      updateMemoryPurchase(rows[idx].purchaseId!, {
        buyerId: input.userId,
        withdrawAddress: address,
      });
    }
    raffle = rows[idx];
  } else {
    const updated = await prisma.treasuryFridayRaffle.update({
      where: { windowId: input.windowId },
      data: {
        prizeStatus: "claimed",
        claimAddress: address,
        claimedAt: new Date(now),
        reason: `${raffle.reason};claimed_awaiting_transfer`,
      },
    });
    if (raffle.purchaseId) {
      await prisma.purchase.update({
        where: { id: raffle.purchaseId },
        data: {
          buyerId: input.userId,
          withdrawAddress: address,
        },
      });
    }
    raffle = toRecord(updated);
  }

  return { ok: true, raffle };
}
