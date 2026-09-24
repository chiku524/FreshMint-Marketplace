import { prisma } from "@/lib/db";
import type { Listing } from "@/lib/discovery/types";
import {
  assertCryptoPayAllowed,
  listingIsMinted,
  payNetworksForListing,
  settlementAddressFor,
  buildCrossChainPayQuote,
} from "@/lib/marketplace/crypto-purchase";
import type { NetworkId } from "@/lib/chains/registry";
import { isNetworkId } from "@/lib/chains/registry";

export type PackageEligibleListing = {
  id: string;
  title: string;
  priceUsd: number;
  network: string;
  chain: string;
  contractAddress: string | null;
  tokenId: string | null;
  mintTxHash: string | null;
};

export type PackageEligibility = {
  ok: boolean;
  reason?: string;
  listings: PackageEligibleListing[];
  defaultPriceUsd: number;
  network: string | null;
};

/** Primary, minted, unsold works in a collection (same network for MVP). */
export function filterPackageEligibleListings(input: {
  listings: Array<
    Pick<
      Listing,
      | "id"
      | "title"
      | "priceUsd"
      | "network"
      | "chain"
      | "collectionId"
      | "delisted"
      | "contractAddress"
      | "tokenId"
      | "mintTxHash"
    >
  >;
  collectionId: string;
  soldIds: Set<string>;
}): PackageEligibility {
  const inCollection = input.listings.filter(
    (l) =>
      l.collectionId === input.collectionId &&
      !l.delisted &&
      !input.soldIds.has(l.id) &&
      listingIsMinted(l) &&
      l.priceUsd != null &&
      l.priceUsd > 0,
  );

  if (inCollection.length < 2) {
    return {
      ok: false,
      reason: "need_at_least_two_unsold",
      listings: [],
      defaultPriceUsd: 0,
      network: null,
    };
  }

  const network = inCollection[0]!.network;
  if (!inCollection.every((l) => l.network === network)) {
    return {
      ok: false,
      reason: "cross_network_not_supported",
      listings: [],
      defaultPriceUsd: 0,
      network: null,
    };
  }

  const listings: PackageEligibleListing[] = inCollection.map((l) => ({
    id: l.id,
    title: l.title,
    priceUsd: l.priceUsd as number,
    network: l.network,
    chain: l.chain,
    contractAddress: l.contractAddress ?? null,
    tokenId: l.tokenId ?? null,
    mintTxHash: l.mintTxHash ?? null,
  }));

  const defaultPriceUsd =
    Math.round(listings.reduce((sum, l) => sum + l.priceUsd, 0) * 100) / 100;

  return { ok: true, listings, defaultPriceUsd, network };
}


/** Pay-from network rules for package: listing items share one network; pay may bridge once. */
export function validatePackagePayNetwork(input: {
  listingNetwork: string | null;
  payNetwork: string;
}): { ok: true; bridged: boolean } | { ok: false; error: string } {
  if (!input.listingNetwork || !isNetworkId(input.listingNetwork)) {
    return { ok: false, error: "listing_network_required" };
  }
  if (!isNetworkId(input.payNetwork)) {
    return { ok: false, error: "invalid_network" };
  }
  const allowed = assertCryptoPayAllowed({
    listingNetwork: input.listingNetwork,
    payNetwork: input.payNetwork,
  });
  if (!allowed.ok) return allowed;
  return {
    ok: true,
    bridged: input.payNetwork !== input.listingNetwork,
  };
}

export async function quoteCollectionPackagePay(input: {
  collectionId: string;
  payNetwork: string;
  buyerPaymentAddress?: string | null;
}): Promise<
  | {
      ok: true;
      amountUsd: number;
      bridged: boolean;
      payNetwork: string;
      listingNetwork: string;
      quote?: {
        settle: { formatted: string; symbol: string; amount: number };
        pay: { formatted: string; symbol: string; amount: number };
      };
      bridge: {
        feeUsd?: string | null;
        estimatedOutput?: string | null;
        requestId?: string | null;
      } | null;
      bridgeQuoteError?: string | null;
    }
  | { ok: false; error: string }
> {
  const eligibility = await getCollectionPackageEligibility(input.collectionId);
  if (!eligibility.packageSellEnabled) {
    return { ok: false, error: "package_sell_disabled" };
  }
  if (!eligibility.ok || eligibility.listings.length < 2 || !eligibility.network) {
    return { ok: false, error: eligibility.reason ?? "ineligible" };
  }
  const payCheck = validatePackagePayNetwork({
    listingNetwork: eligibility.network,
    payNetwork: input.payNetwork,
  });
  if (!payCheck.ok) return { ok: false, error: payCheck.error };

  const amountUsd =
    eligibility.packagePriceUsd != null && eligibility.packagePriceUsd > 0
      ? eligibility.packagePriceUsd
      : eligibility.defaultPriceUsd;

  const listingNetwork = eligibility.network as NetworkId;
  const { publicPayQuote } = await import("@/lib/marketplace/crypto-purchase");
  const { quotePayInFromUsdAt } = await import("@/lib/onchain/fx");
  const { vmFromNetwork } = await import("@/lib/chains/registry");

  const fx = quotePayInFromUsdAt({
    amountUsd,
    listingChain: vmFromNetwork(listingNetwork),
    payNetwork: input.payNetwork as NetworkId,
  });
  const quote = publicPayQuote({
    settle: fx.settle,
    pay: fx.pay,
    bridged: payCheck.bridged,
  });

  if (!payCheck.bridged) {
    return {
      ok: true,
      amountUsd,
      bridged: false,
      payNetwork: input.payNetwork,
      listingNetwork,
      quote,
      bridge: null,
      bridgeQuoteError: null,
    };
  }

  if (!input.buyerPaymentAddress) {
    return {
      ok: true,
      amountUsd,
      bridged: true,
      payNetwork: input.payNetwork,
      listingNetwork,
      quote,
      bridge: null,
      bridgeQuoteError: "wallet_required_for_live_quote",
    };
  }

  try {
    const live = await buildCrossChainPayQuote({
      listingNetwork,
      payNetwork: input.payNetwork as NetworkId,
      amountUsd,
      buyerPaymentAddress: input.buyerPaymentAddress,
      settlementAddress: settlementAddressFor(listingNetwork),
    });
    return {
      ok: true,
      amountUsd,
      bridged: true,
      payNetwork: input.payNetwork,
      listingNetwork,
      quote,
      bridge: live.bridge
        ? {
            feeUsd: live.bridge.feeUsd ?? null,
            estimatedOutput: live.bridge.estimatedOutput ?? null,
            requestId: live.bridge.requestId ?? null,
          }
        : null,
      bridgeQuoteError: live.bridge?.feeUsd ? null : "fee_unavailable",
    };
  } catch (e) {
    return {
      ok: true,
      amountUsd,
      bridged: true,
      payNetwork: input.payNetwork,
      listingNetwork,
      quote,
      bridge: null,
      bridgeQuoteError: e instanceof Error ? e.message : "bridge_quote_failed",
    };
  }
}


export async function getCollectionPackageEligibility(collectionId: string) {
  const { getDiscoveryEngine } = await import("@/lib/marketplace/service");
  const { listClosedPrimarySaleIds } = await import("@/lib/marketplace/sales");
  const engine = await getDiscoveryEngine();
  const collection = engine.state.collections.get(collectionId);
  if (!collection) {
    return {
      ok: false as const,
      reason: "collection_not_found",
      listings: [] as PackageEligibleListing[],
      defaultPriceUsd: 0,
      network: null as string | null,
      packageSellEnabled: false,
      packagePriceUsd: null as number | null,
      payNetworks: [] as NetworkId[],
    };
  }

  const soldIds = await listClosedPrimarySaleIds();
  const base = filterPackageEligibleListings({
    listings: [...engine.state.listings.values()],
    collectionId,
    soldIds,
  });

  const packageSellEnabled = Boolean(
    (collection as { packageSellEnabled?: boolean }).packageSellEnabled,
  );
  const packagePriceUsd =
    (collection as { packagePriceUsd?: number | null }).packagePriceUsd ?? null;

  const payNetworks =
    base.network && isNetworkId(base.network)
      ? payNetworksForListing(base.network)
      : [];
  return { ...base, packageSellEnabled, packagePriceUsd, payNetworks };
}

export async function updateCollectionPackageSell(input: {
  collectionId: string;
  creatorId: string;
  packageSellEnabled: boolean;
  packagePriceUsd?: number | null;
}): Promise<
  | { ok: true; packageSellEnabled: boolean; packagePriceUsd: number | null }
  | { ok: false; error: string }
> {
  const { getDiscoveryEngine } = await import("@/lib/marketplace/service");
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );

  const engine = await getDiscoveryEngine();
  const collection = engine.state.collections.get(input.collectionId);
  if (!collection) return { ok: false, error: "collection_not_found" };
  if (collection.creatorId !== input.creatorId) {
    return { ok: false, error: "forbidden" };
  }

  const eligibility = await getCollectionPackageEligibility(input.collectionId);
  let price =
    input.packagePriceUsd === undefined
      ? eligibility.packagePriceUsd
      : input.packagePriceUsd;
  if (price == null || !(price > 0)) {
    price = eligibility.defaultPriceUsd;
  }
  if (input.packageSellEnabled && eligibility.listings.length < 2) {
    return { ok: false, error: "need_at_least_two_unsold" };
  }

  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    const mem = getMemoryEngine();
    const c = mem.state.collections.get(input.collectionId);
    if (!c) return { ok: false, error: "collection_not_found" };
    (c as { packageSellEnabled?: boolean }).packageSellEnabled =
      input.packageSellEnabled;
    (c as { packagePriceUsd?: number | null }).packagePriceUsd = price;
    mem.state.collections.set(input.collectionId, c);
    return {
      ok: true,
      packageSellEnabled: input.packageSellEnabled,
      packagePriceUsd: price,
    };
  }

  await prisma.collection.update({
    where: { id: input.collectionId },
    data: {
      packageSellEnabled: input.packageSellEnabled,
      packagePriceUsd: price,
    },
  });

  (collection as { packageSellEnabled?: boolean }).packageSellEnabled =
    input.packageSellEnabled;
  (collection as { packagePriceUsd?: number | null }).packagePriceUsd = price;

  return {
    ok: true,
    packageSellEnabled: input.packageSellEnabled,
    packagePriceUsd: price,
  };
}

/**
 * Package buy: one PackagePurchase + N Purchase rows.
 * Pay total once (optionally one Relay bridge); sequential escrow transfers.
 */
export async function prepareCollectionPackagePurchase(input: {
  collectionId: string;
  buyerId: string;
  payNetwork: string;
  buyerPaymentAddress: string;
  buyerReceiveAddress: string;
  simulate?: boolean;
  paymentTxHash?: string;
}): Promise<
  | {
      ok: true;
      packagePurchaseId: string;
      amountUsd: number;
      listingIds: string[];
      network: string;
      status: string;
      purchaseIds: string[];
      settlement:
        | "pay_once_then_sequential_transfers"
        | "bridge_once_then_sequential_transfers";
      bridged: boolean;
      payNetwork: string;
      bridge?: {
        requestId?: string | null;
        feeUsd?: string | null;
        estimatedOutput?: string | null;
      } | null;
    }
  | { ok: false; error: string }
> {
  const eligibility = await getCollectionPackageEligibility(input.collectionId);
  if (!eligibility.packageSellEnabled) {
    return { ok: false, error: "package_sell_disabled" };
  }
  if (!eligibility.ok || eligibility.listings.length < 2) {
    return { ok: false, error: eligibility.reason ?? "ineligible" };
  }
  const payCheck = validatePackagePayNetwork({
    listingNetwork: eligibility.network,
    payNetwork: input.payNetwork,
  });
  if (!payCheck.ok) {
    return { ok: false, error: payCheck.error };
  }
  const bridged = payCheck.bridged;

  const amountUsd =
    eligibility.packagePriceUsd != null && eligibility.packagePriceUsd > 0
      ? eligibility.packagePriceUsd
      : eligibility.defaultPriceUsd;

  const listingIds = eligibility.listings.map((l) => l.id);

  let bridgeMeta: {
    requestId?: string | null;
    feeUsd?: string | null;
    estimatedOutput?: string | null;
  } | null = null;
  if (bridged) {
    try {
      const listingNetwork = eligibility.network as NetworkId;
      const quote = await buildCrossChainPayQuote({
        listingNetwork,
        payNetwork: input.payNetwork as NetworkId,
        amountUsd,
        buyerPaymentAddress: input.buyerPaymentAddress,
        settlementAddress: settlementAddressFor(listingNetwork),
      });
      bridgeMeta = {
        requestId: quote.bridge?.requestId ?? null,
        feeUsd: quote.bridge?.feeUsd ?? null,
        estimatedOutput: quote.bridge?.estimatedOutput ?? null,
      };
    } catch (e) {
      return {
        ok: false,
        error:
          e instanceof Error && e.message.includes("boing")
            ? "boing_same_chain_only"
            : e instanceof Error
              ? e.message
              : "bridge_quote_failed",
      };
    }
  }

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, recordMemoryPurchase } = await import(
    "@/lib/data/memory-store"
  );
  const { splitSaleProceeds } = await import("@/lib/fees/platform");
  const mode = await ensureDatabaseReady();
  const perListing = Math.round((amountUsd / listingIds.length) * 100) / 100;

  if (mode === "memory" || isMemoryMode()) {
    const packagePurchaseId = `pkg-mem-${Date.now()}`;
    const purchaseIds: string[] = [];
    for (const listing of eligibility.listings) {
      const fees = splitSaleProceeds(perListing);
      const row = recordMemoryPurchase({
        listingId: listing.id,
        buyerId: input.buyerId,
        amountUsd: perListing,
        feeTotalUsd: fees.feeTotalUsd,
        feeTreasuryUsd: fees.feeTreasuryUsd,
        feeOperatorUsd: fees.feeOperatorUsd,
        sellerNetUsd: fees.sellerNetUsd,
        soldAt: Date.now(),
        status: input.simulate ? "completed" : "pending_payment",
        payNetwork: input.payNetwork,
        paymentTxHash: input.paymentTxHash ?? null,
        txHash: input.simulate ? `sim-pkg-${listing.id}` : null,
        chain: listing.chain,
      });
      purchaseIds.push(row.id);
    }
    if (!input.simulate) {
      try {
        const { notifyCreatorPackageSold } = await import(
          "@/lib/notifications/emit"
        );
        const { getDiscoveryEngine } = await import(
          "@/lib/marketplace/service"
        );
        const engine = await getDiscoveryEngine();
        const col = engine.state.collections.get(input.collectionId);
        if (col) {
          await notifyCreatorPackageSold({
            creatorId: col.creatorId,
            collectionId: input.collectionId,
            collectionTitle: col.title,
            packagePurchaseId,
            amountUsd,
            listingCount: listingIds.length,
          });
        }
      } catch (err) {
        console.warn("[freshmint] package notify failed", err);
      }
    }
    return {
      ok: true,
      packagePurchaseId,
      amountUsd,
      listingIds,
      network: eligibility.network!,
      status: input.simulate ? "completed" : "pending_payment",
      purchaseIds,
      settlement: bridged
        ? "bridge_once_then_sequential_transfers"
        : "pay_once_then_sequential_transfers",
      bridged,
      payNetwork: input.payNetwork,
      bridge: bridgeMeta,
    };
  }

  const created = await prisma.$transaction(async (tx) => {
    const pkg = await tx.packagePurchase.create({
      data: {
        collectionId: input.collectionId,
        buyerId: input.buyerId,
        amountUsd,
        listingIdsJson: JSON.stringify(listingIds),
        status: input.simulate ? "completed" : "pending_payment",
        payNetwork: input.payNetwork,
        paymentTxHash: input.paymentTxHash ?? null,
      },
    });
    const purchaseIds: string[] = [];
    for (const listing of eligibility.listings) {
      const fees = splitSaleProceeds(perListing);
      const purchase = await tx.purchase.create({
        data: {
          listingId: listing.id,
          buyerId: input.buyerId,
          amountUsd: perListing,
          feeTotalUsd: fees.feeTotalUsd,
          feeTreasuryUsd: fees.feeTreasuryUsd,
          feeOperatorUsd: fees.feeOperatorUsd,
          sellerNetUsd: fees.sellerNetUsd,
          status: input.simulate ? "completed" : "pending_payment",
          payNetwork: input.payNetwork,
          paymentTxHash: input.paymentTxHash ?? null,
          txHash: input.simulate ? `sim-pkg-${listing.id}` : null,
          chain: listing.chain,
          packagePurchaseId: pkg.id,
        },
      });
      purchaseIds.push(purchase.id);
    }
    return { pkg, purchaseIds };
  });

  if (!input.simulate) {
    try {
      const { notifyCreatorPackageSold } = await import(
        "@/lib/notifications/emit"
      );
      const { getDiscoveryEngine } = await import(
        "@/lib/marketplace/service"
      );
      const engine = await getDiscoveryEngine();
      const col = engine.state.collections.get(input.collectionId);
      if (col) {
        await notifyCreatorPackageSold({
          creatorId: col.creatorId,
          collectionId: input.collectionId,
          collectionTitle: col.title,
          packagePurchaseId: created.pkg.id,
          amountUsd,
          listingCount: listingIds.length,
        });
      }
    } catch (err) {
      console.warn("[freshmint] package notify failed", err);
    }
  }

  return {
    ok: true,
    packagePurchaseId: created.pkg.id,
    amountUsd,
    listingIds,
    network: eligibility.network!,
    status: created.pkg.status,
    purchaseIds: created.purchaseIds,
    settlement: bridged
      ? "bridge_once_then_sequential_transfers"
      : "pay_once_then_sequential_transfers",
    bridged,
    payNetwork: input.payNetwork,
    bridge: bridgeMeta,
  };
}
