import { prisma } from "@/lib/db";
import type { Listing } from "@/lib/discovery/types";
import { listingIsMinted } from "@/lib/marketplace/crypto-purchase";

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

  return { ...base, packageSellEnabled, packagePriceUsd };
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
 * Same-network package buy MVP: one PackagePurchase + N Purchase rows.
 * Pay total once; sequential escrow transfers via existing purchase lifecycle.
 * Cross-chain package buys are out of scope.
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
      settlement: "pay_once_then_sequential_transfers";
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
  if (input.payNetwork !== eligibility.network) {
    return { ok: false, error: "same_network_only" };
  }

  const amountUsd =
    eligibility.packagePriceUsd != null && eligibility.packagePriceUsd > 0
      ? eligibility.packagePriceUsd
      : eligibility.defaultPriceUsd;

  const listingIds = eligibility.listings.map((l) => l.id);
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
    return {
      ok: true,
      packagePurchaseId,
      amountUsd,
      listingIds,
      network: eligibility.network!,
      status: input.simulate ? "completed" : "pending_payment",
      purchaseIds,
      settlement: "pay_once_then_sequential_transfers",
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

  return {
    ok: true,
    packagePurchaseId: created.pkg.id,
    amountUsd,
    listingIds,
    network: eligibility.network!,
    status: created.pkg.status,
    purchaseIds: created.purchaseIds,
    settlement: "pay_once_then_sequential_transfers",
  };
}
