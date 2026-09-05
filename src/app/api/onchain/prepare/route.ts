import { getSessionUser } from "@/lib/auth/session";
import { resolveNetwork } from "@/lib/chains/registry";
import { prisma } from "@/lib/db";
import { ensureDatabaseReady } from "@/lib/db-ready";
import type { Chain } from "@/lib/discovery/types";
import {
  prepareBodySchema,
  readJsonBody,
} from "@/lib/marketplace/purchase-request";
import { buildEvmMintIntent, buildEvmPurchaseIntent } from "@/lib/onchain/evm";
import {
  buildBoingMintIntent,
  buildBoingPurchaseIntent,
  preflightBoingNftDeployQa,
} from "@/lib/onchain/boing";
import {
  buildSolanaMintIntent,
  buildSolanaMintTransactionBase64,
  buildSolanaPurchaseIntent,
  buildSolanaMemoTransactionBase64,
  isValidSolanaAddress,
} from "@/lib/onchain/solana";
import { NextRequest, NextResponse } from "next/server";

type PrepareListing = {
  id: string;
  title: string;
  chain: Chain;
  network: string | null;
  contractAddress: string | null;
  tokenId: string | null;
  priceUsd: number | null;
  mediaUrl: string | null;
};

async function loadListing(listingId: string): Promise<{
  listing: PrepareListing;
  memory: boolean;
} | null> {
  const mode = await ensureDatabaseReady();
  const { isMemoryMode, getMemoryEngine } = await import(
    "@/lib/data/memory-store"
  );
  const memory = mode === "memory" || isMemoryMode();
  if (memory) {
    const row = getMemoryEngine().state.listings.get(listingId);
    if (!row) return null;
    return {
      memory: true,
      listing: {
        id: row.id,
        title: row.title,
        chain: row.chain,
        network: row.network,
        contractAddress: row.contractAddress ?? null,
        tokenId: row.tokenId ?? null,
        priceUsd: row.priceUsd,
        mediaUrl: row.mediaUrl ?? null,
      },
    };
  }

  try {
    const row = await prisma.listing.findUnique({ where: { id: listingId } });
    if (row) {
      return {
        memory: false,
        listing: {
          id: row.id,
          title: row.title,
          chain: row.chain as Chain,
          network: row.network,
          contractAddress: row.contractAddress,
          tokenId: row.tokenId,
          priceUsd: row.priceUsd,
          mediaUrl: row.mediaUrl,
        },
      };
    }
  } catch {
    // Catalog may still be in memory if Postgres dropped mid-request.
  }

  const fallback = getMemoryEngine().state.listings.get(listingId);
  if (!fallback) return null;
  return {
    memory: true,
    listing: {
      id: fallback.id,
      title: fallback.title,
      chain: fallback.chain,
      network: fallback.network,
      contractAddress: fallback.contractAddress ?? null,
      tokenId: fallback.tokenId ?? null,
      priceUsd: fallback.priceUsd,
      mediaUrl: fallback.mediaUrl ?? null,
    },
  };
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = prepareBodySchema.safeParse(await readJsonBody(req));
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const loaded = await loadListing(body.data.listingId);
  if (!loaded) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { listing, memory } = loaded;

  const network = resolveNetwork(listing.network, listing.chain);
  const wallet =
    body.data.buyerAddress ??
    user.wallets.find((w) => w.chain === listing.chain)?.address;
  if (!wallet) {
    return NextResponse.json(
      { error: "wallet_required", chain: listing.chain },
      { status: 400 },
    );
  }

  const tokenUri =
    listing.mediaUrl ?? `https://freshmint.local/metadata/${listing.id}`;

  if (body.data.action === "mint") {
    if (listing.chain === "evm") {
      const mint = buildEvmMintIntent({
        creatorAddress: wallet,
        tokenUri,
        listingId: listing.id,
        network,
        priceUsd: listing.priceUsd,
      });
      return NextResponse.json({ ok: true, intent: mint });
    }
    if (listing.chain === "boing") {
      const mint = buildBoingMintIntent({
        creatorAddress: wallet,
        metadataUri: tokenUri,
        listingId: listing.id,
        title: listing.title,
      });
      const bytecode = mint.walletTx.tx.bytecode;
      const qa =
        typeof bytecode === "string"
          ? await preflightBoingNftDeployQa({
              bytecode,
              assetName: String(mint.walletTx.tx.asset_name ?? listing.title),
              assetSymbol: String(mint.walletTx.tx.asset_symbol ?? "FMINT"),
              descriptionHash:
                typeof mint.walletTx.tx.description_hash === "string"
                  ? mint.walletTx.tx.description_hash
                  : undefined,
            })
          : undefined;
      if (qa?.result === "reject") {
        return NextResponse.json(
          { error: qa.message ?? "boing_qa_rejected", qa, intent: mint },
          { status: 400 },
        );
      }
      return NextResponse.json({ ok: true, intent: mint, qa });
    }
    const mint = buildSolanaMintIntent({
      creatorAddress: wallet,
      metadataUri: tokenUri,
      listingId: listing.id,
      title: listing.title,
    });
    let serialized: string | null = null;
    let assetAddress: string | undefined;
    let mode = "memo_fallback";
    try {
      const built = await buildSolanaMintTransactionBase64({
        feePayer: wallet,
        metadataUri: tokenUri,
        name: listing.title,
        listingId: listing.id,
      });
      serialized = built.serialized;
      assetAddress = built.assetAddress;
      mode = built.mode;
      if (assetAddress) {
        if (memory) {
          const { getMemoryEngine } = await import("@/lib/data/memory-store");
          const engine = getMemoryEngine();
          const current = engine.state.listings.get(listing.id);
          if (current) {
            engine.state.listings.set(listing.id, {
              ...current,
              contractAddress: assetAddress,
              tokenId: assetAddress,
            });
          }
        } else {
          await prisma.listing.update({
            where: { id: listing.id },
            data: {
              contractAddress: assetAddress,
              tokenId: assetAddress,
            },
          });
        }
      }
    } catch {
      serialized = null;
    }
    return NextResponse.json({
      ok: true,
      intent: mint,
      serialized,
      assetAddress,
      mode,
    });
  }

  // buy
  if (listing.chain === "evm") {
    const buy = buildEvmPurchaseIntent({
      buyerAddress: wallet,
      contractAddress: listing.contractAddress,
      tokenId: listing.tokenId ?? "0",
      network,
      amountUsd: body.data.amountUsd ?? listing.priceUsd ?? 0,
      tokenUri,
    });
    return NextResponse.json({
      ok: true,
      intent: buy,
      walletTx: buy.walletTx,
    });
  }
  if (listing.chain === "boing") {
    const buy = buildBoingPurchaseIntent({
      buyerAddress: wallet,
      listingId: listing.id,
      collection: listing.contractAddress,
      tokenId: listing.tokenId,
      amountUsd: body.data.amountUsd ?? listing.priceUsd ?? 0,
      metadataUri: tokenUri,
      title: listing.title,
    });
    return NextResponse.json({
      ok: true,
      intent: buy,
      walletTx: buy.walletTx,
    });
  }

  const buy = buildSolanaPurchaseIntent({
    buyerAddress: wallet,
    mintAddress: listing.contractAddress ?? "unknown",
    priceLamports: Math.round(
      (body.data.amountUsd ?? listing.priceUsd ?? 0) * 1_000_000,
    ),
    listingId: listing.id,
  });
  let serialized: string | null = null;
  if (isValidSolanaAddress(wallet)) {
    try {
      serialized = await buildSolanaMemoTransactionBase64({
        feePayer: wallet,
        memo: buy.message,
      });
    } catch {
      serialized = null;
    }
  }
  const walletTx = buy.walletTx
    ? { ...buy.walletTx, serialized: serialized ?? undefined }
    : undefined;
  return NextResponse.json({
    ok: true,
    intent: buy,
    serialized,
    walletTx,
  });
}
