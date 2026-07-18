import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ensureDatabaseReady } from "@/lib/db-ready";
import { buildEvmMintIntent, buildEvmPurchaseIntent } from "@/lib/onchain/evm";
import {
  buildSolanaMintIntent,
  buildSolanaPurchaseIntent,
  buildSolanaMemoTransactionBase64,
} from "@/lib/onchain/solana";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  listingId: z.string(),
  action: z.enum(["mint", "buy"]),
  amountUsd: z.number().nonnegative().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  await ensureDatabaseReady();
  const listing = await prisma.listing.findUnique({
    where: { id: body.data.listingId },
  });
  if (!listing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const wallet =
    user.wallets.find((w) => w.chain === listing.chain)?.address ??
    user.wallets[0]?.address;
  if (!wallet) {
    return NextResponse.json({ error: "wallet_required" }, { status: 400 });
  }

  const tokenUri = listing.mediaUrl ?? `freshmint://${listing.id}`;

  if (body.data.action === "mint") {
    if (listing.chain === "evm") {
      const mint = buildEvmMintIntent({
        creatorAddress: wallet,
        tokenUri,
        listingId: listing.id,
        priceUsd: listing.priceUsd,
      });
      return NextResponse.json({ ok: true, intent: mint });
    }
    const mint = buildSolanaMintIntent({
      creatorAddress: wallet,
      metadataUri: tokenUri,
      listingId: listing.id,
    });
    let serialized: string | null = null;
    try {
      serialized = await buildSolanaMemoTransactionBase64({
        feePayer: wallet,
        memo: String(mint.calldata),
      });
    } catch {
      serialized = null;
    }
    return NextResponse.json({ ok: true, intent: mint, serialized });
  }

  // buy
  if (listing.chain === "evm") {
    const buy = buildEvmPurchaseIntent({
      buyerAddress: wallet,
      contractAddress: listing.contractAddress ?? "0x0",
      tokenId: listing.tokenId ?? "0",
      priceWei: String(Math.round((body.data.amountUsd ?? listing.priceUsd ?? 0) * 1e15)),
    });
    return NextResponse.json({ ok: true, intent: buy });
  }

  const buy = buildSolanaPurchaseIntent({
    buyerAddress: wallet,
    mintAddress: listing.contractAddress ?? "unknown",
    priceLamports: Math.round((body.data.amountUsd ?? listing.priceUsd ?? 0) * 1_000_000),
    listingId: listing.id,
  });
  let serialized: string | null = null;
  try {
    serialized = await buildSolanaMemoTransactionBase64({
      feePayer: wallet,
      memo: buy.message,
    });
  } catch {
    serialized = null;
  }
  return NextResponse.json({ ok: true, intent: buy, serialized });
}
