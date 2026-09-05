import { publicNativeQuote, quotePayInFromUsd } from "@/lib/onchain/fx";
import { isNetworkId } from "@/lib/chains/registry";
import type { Chain } from "@/lib/discovery/types";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function chainFromQuery(value: string | null): Chain {
  if (value === "solana" || value === "boing" || value === "evm") return value;
  return "evm";
}

export async function GET(req: NextRequest) {
  const amountUsd = Number(req.nextUrl.searchParams.get("amountUsd") ?? "");
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }
  const listingChain = chainFromQuery(req.nextUrl.searchParams.get("chain"));
  const payRaw = req.nextUrl.searchParams.get("payNetwork") ?? "";
  const payNetwork = isNetworkId(payRaw)
    ? payRaw
    : listingChain === "solana"
      ? "solana"
      : listingChain === "boing"
        ? "boing"
        : "ethereum";

  const priced = await quotePayInFromUsd({
    amountUsd,
    listingChain,
    payNetwork,
  });

  return NextResponse.json({
    ok: true,
    amountUsd,
    listingChain,
    payNetwork,
    settle: publicNativeQuote(priced.settle),
    pay: publicNativeQuote(priced.pay),
    bridged: priced.bridged,
  });
}
