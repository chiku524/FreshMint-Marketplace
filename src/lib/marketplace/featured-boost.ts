import { FEATURED_BOOST_USD } from "@/lib/fees/featured-boost";
import { platformFeeRecipients } from "@/lib/fees/platform";
import { prisma } from "@/lib/db";
import { toListing } from "@/lib/data/mappers";
import type { Listing } from "@/lib/discovery/types";
import {
  isNetworkId,
  listBridgeNetworks,
  vmFromNetwork,
  type NetworkId,
} from "@/lib/chains/registry";
import {
  buildNativePaymentWalletTx,
  publicNativeQuote,
  settlementAddressFor,
} from "@/lib/marketplace/crypto-purchase";
import { verifyEvmTx } from "@/lib/onchain/evm";
import { verifySolanaTx } from "@/lib/onchain/solana";
import { verifyBoingTx } from "@/lib/onchain/boing";

async function inMemoryMode(): Promise<boolean> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  return mode === "memory" || isMemoryMode();
}

/** Networks creators may pay Featured boost on (same-chain native → treasury). */
export function boostPayNetworks(listingNetwork?: NetworkId | string | null): NetworkId[] {
  const bridgeable = listBridgeNetworks().map((n) => n.id);
  const preferred =
    listingNetwork && isNetworkId(listingNetwork) ? listingNetwork : null;
  if (preferred === "boing") return ["boing"];
  if (preferred && bridgeable.includes(preferred)) {
    return [preferred, ...bridgeable.filter((id) => id !== preferred)];
  }
  return bridgeable;
}

function assertBoostPayNetwork(
  payNetwork: string,
): { ok: true; network: NetworkId } | { ok: false; error: string } {
  if (!isNetworkId(payNetwork)) return { ok: false, error: "invalid_network" };
  if (payNetwork === "boing") {
    // Boing treasury uses the EVM-shaped platform address when configured.
    return { ok: true, network: payNetwork };
  }
  const allowed = listBridgeNetworks().map((n) => n.id);
  if (!allowed.includes(payNetwork)) {
    return { ok: false, error: "invalid_network" };
  }
  return { ok: true, network: payNetwork };
}

function boostModerationNote(input: {
  payNetwork: NetworkId;
  txHash: string;
  settlementAddress: string;
}): string {
  return [
    "featured_boost_paid",
    `usd=${FEATURED_BOOST_USD}`,
    `network=${input.payNetwork}`,
    `tx=${input.txHash}`,
    `to=${input.settlementAddress}`,
  ].join(":");
}

async function loadOwnedListing(input: {
  actorId: string;
  listingId: string;
}): Promise<
  | { ok: true; listing: Listing; memory: boolean }
  | { ok: false; error: string }
> {
  if (await inMemoryMode()) {
    const { getMemoryEngine } = await import("@/lib/data/memory-store");
    const engine = getMemoryEngine();
    const listing = engine.state.listings.get(input.listingId);
    if (!listing || listing.delisted) return { ok: false, error: "unavailable" };
    if (listing.creatorId !== input.actorId) return { ok: false, error: "forbidden" };
    if (listing.stage === "draft") return { ok: false, error: "publish_first" };
    if (listing.featuredBoostedAt != null) {
      return { ok: false, error: "already_boosted" };
    }
    return { ok: true, listing, memory: true };
  }

  const row = await prisma.listing.findUnique({ where: { id: input.listingId } });
  if (!row || row.delisted) return { ok: false, error: "unavailable" };
  if (row.creatorId !== input.actorId) return { ok: false, error: "forbidden" };
  if (row.stage === "draft") return { ok: false, error: "publish_first" };
  if (row.featuredBoostedAt != null) return { ok: false, error: "already_boosted" };
  return { ok: true, listing: toListing(row), memory: false };
}

/**
 * Prepare a native USD-quoted payment to the platform treasury for Featured boost.
 * Does not set featuredBoostedAt — call confirmFeaturedBoost after the wallet tx.
 */
export async function prepareFeaturedBoost(input: {
  actorId: string;
  listingId: string;
  payNetwork: string;
  fromAddress: string;
}): Promise<
  | {
      ok: true;
      feeUsd: number;
      payNetwork: NetworkId;
      settlementAddress: string;
      feeRecipients: ReturnType<typeof platformFeeRecipients>;
      walletTx: Record<string, unknown>;
      quote: ReturnType<typeof publicNativeQuote>;
      payNetworks: NetworkId[];
      settlement: "pay_treasury_native";
    }
  | { ok: false; error: string }
> {
  const loaded = await loadOwnedListing(input);
  if (!loaded.ok) return loaded;

  const pay = assertBoostPayNetwork(input.payNetwork);
  if (!pay.ok) return pay;
  if (!input.fromAddress?.trim()) {
    return { ok: false, error: "wallet_required" };
  }

  const settlementAddress = settlementAddressFor(pay.network);
  const fees = platformFeeRecipients();
  const chain = vmFromNetwork(pay.network);
  const { walletTx, quote } = await buildNativePaymentWalletTx({
    network: pay.network,
    fromAddress: input.fromAddress.trim(),
    toAddress: settlementAddress,
    amountUsd: FEATURED_BOOST_USD,
    listingChain: chain,
  });

  // Tag Solana memos so treasury ops can distinguish boost from primary sales.
  if (walletTx.chain === "solana" && typeof walletTx.memo === "string") {
    try {
      const parsed = JSON.parse(walletTx.memo) as Record<string, unknown>;
      walletTx.memo = JSON.stringify({
        ...parsed,
        kind: "freshmint_featured_boost",
        listingId: input.listingId,
      });
    } catch {
      /* keep original memo */
    }
  }

  return {
    ok: true,
    feeUsd: FEATURED_BOOST_USD,
    payNetwork: pay.network,
    settlementAddress,
    feeRecipients: fees,
    walletTx,
    quote: publicNativeQuote(quote),
    payNetworks: boostPayNetworks(loaded.listing.network),
    settlement: "pay_treasury_native",
  };
}

async function verifyBoostTx(input: {
  payNetwork: NetworkId;
  txHash: string;
}): Promise<{ ok: true; soft?: boolean } | { ok: false; error: string }> {
  const hash = input.txHash.trim();
  if (!hash || hash.length < 8) return { ok: false, error: "invalid_tx" };
  if (hash.startsWith("pending:") || hash.startsWith("bridge:")) {
    return { ok: false, error: "invalid_tx" };
  }

  const requireLive = process.env.FEATURED_BOOST_REQUIRE_CONFIRM === "true";
  const vm = vmFromNetwork(input.payNetwork);

  if (vm === "evm") {
    if (!hash.startsWith("0x") || hash.length < 10) {
      return { ok: false, error: "invalid_tx" };
    }
    const verified = await verifyEvmTx({
      network: input.payNetwork,
      txHash: hash,
    });
    if (verified.ok) return { ok: true };
    if (verified.error === "tx_reverted") {
      return { ok: false, error: "tx_reverted" };
    }
    if (requireLive) {
      return { ok: false, error: verified.error ?? "verify_failed" };
    }
    // Soft accept: hash format ok, RPC miss / not indexed yet.
    if (hash.length >= 66) return { ok: true, soft: true };
    return { ok: false, error: verified.error ?? "verify_failed" };
  }

  if (vm === "solana") {
    const verified = await verifySolanaTx(hash);
    if (verified.ok) return { ok: true };
    if (requireLive || process.env.SOLANA_REQUIRE_CONFIRM === "true") {
      return { ok: false, error: verified.error ?? "verify_failed" };
    }
    return { ok: true, soft: true };
  }

  const verified = await verifyBoingTx(hash);
  if (verified) return { ok: true };
  if (requireLive) return { ok: false, error: "verify_failed" };
  return { ok: true, soft: true };
}

/**
 * Confirm Featured boost after treasury payment. Sets featuredBoostedAt only
 * once a tx hash is submitted and (best-effort) validated.
 */
export async function confirmFeaturedBoost(input: {
  actorId: string;
  listingId: string;
  payNetwork: string;
  txHash: string;
}): Promise<
  | {
      ok: true;
      listing: Listing;
      feeUsd: number;
      settlement: "paid";
      paymentTxHash: string;
      payNetwork: NetworkId;
      settlementAddress: string;
    }
  | { ok: false; error: string }
> {
  const loaded = await loadOwnedListing(input);
  if (!loaded.ok) return loaded;

  const pay = assertBoostPayNetwork(input.payNetwork);
  if (!pay.ok) return pay;

  const hash = input.txHash?.trim() ?? "";
  if (!hash || hash.length < 8) return { ok: false, error: "invalid_tx" };

  if (!loaded.memory) {
    const verified = await verifyBoostTx({
      payNetwork: pay.network,
      txHash: hash,
    });
    if (!verified.ok) return verified;
  }

  const now = Date.now();
  const settlementAddress = settlementAddressFor(pay.network);
  const note = boostModerationNote({
    payNetwork: pay.network,
    txHash: hash,
    settlementAddress,
  });

  if (loaded.memory) {
    const { getMemoryEngine } = await import("@/lib/data/memory-store");
    const engine = getMemoryEngine();
    const updated: Listing = {
      ...loaded.listing,
      featuredBoostedAt: now,
    };
    engine.state.listings.set(loaded.listing.id, updated);
    return {
      ok: true,
      listing: updated,
      feeUsd: FEATURED_BOOST_USD,
      settlement: "paid",
      paymentTxHash: hash,
      payNetwork: pay.network,
      settlementAddress,
    };
  }

  const updated = await prisma.listing.update({
    where: { id: loaded.listing.id },
    data: { featuredBoostedAt: new Date(now) },
  });

  await prisma.moderationAction.create({
    data: {
      actorId: input.actorId,
      targetType: "listing",
      targetId: loaded.listing.id,
      action: "feature",
      note,
    },
  });

  return {
    ok: true,
    listing: toListing(updated),
    feeUsd: FEATURED_BOOST_USD,
    settlement: "paid",
    paymentTxHash: hash,
    payNetwork: pay.network,
    settlementAddress,
  };
}

/** Boosted listings for the Featured page Promoted section. */
export function selectBoostedFeatured(
  listings: Iterable<Listing>,
): Listing[] {
  return [...listings]
    .filter(
      (l) =>
        !l.delisted &&
        l.featuredBoostedAt != null &&
        l.stage !== "draft",
    )
    .sort(
      (a, b) => (b.featuredBoostedAt ?? 0) - (a.featuredBoostedAt ?? 0),
    );
}
