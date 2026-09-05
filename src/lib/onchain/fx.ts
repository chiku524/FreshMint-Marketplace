import type { Chain } from "@/lib/discovery/types";

export type NativeSymbol = "ETH" | "SOL" | "BOING";

export type NativeQuote = {
  amountUsd: number;
  chain: Chain;
  symbol: NativeSymbol;
  usdPerNative: number;
  amount: number;
  baseUnits: bigint;
  formatted: string;
};

const DEFAULT_USD_PER_NATIVE: Record<NativeSymbol, number> = {
  ETH: 3000,
  SOL: 150,
  BOING: 1,
};

const DECIMALS: Record<NativeSymbol, number> = {
  ETH: 18,
  SOL: 9,
  BOING: 18,
};

const RATE_ENV: Record<NativeSymbol, string> = {
  ETH: "NEXT_PUBLIC_USD_PER_ETH",
  SOL: "NEXT_PUBLIC_USD_PER_SOL",
  BOING: "NEXT_PUBLIC_USD_PER_BOING",
};

export function nativeSymbolForChain(chain: Chain): NativeSymbol {
  if (chain === "solana") return "SOL";
  if (chain === "boing") return "BOING";
  return "ETH";
}

export function usdPerNative(symbol: NativeSymbol): number {
  const raw = process.env[RATE_ENV[symbol]];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_USD_PER_NATIVE[symbol];
}

export function baseUnitsFromUsd(amountUsd: number, symbol: NativeSymbol): bigint {
  const rate = usdPerNative(symbol);
  const decimals = DECIMALS[symbol];
  const amount = Math.max(0, amountUsd) / rate;
  return BigInt(Math.max(0, Math.round(amount * 10 ** decimals)));
}

export function quoteNativeFromUsd(amountUsd: number, chain: Chain): NativeQuote {
  const symbol = nativeSymbolForChain(chain);
  const rate = usdPerNative(symbol);
  const amount = Math.max(0, amountUsd) / rate;
  const baseUnits = baseUnitsFromUsd(amountUsd, symbol);
  const digits = symbol === "SOL" ? 4 : 6;
  return {
    amountUsd,
    chain,
    symbol,
    usdPerNative: rate,
    amount,
    baseUnits,
    formatted: `${amount.toFixed(digits)} ${symbol}`,
  };
}

export function publicNativeQuote(quote: NativeQuote) {
  return {
    amountUsd: quote.amountUsd,
    chain: quote.chain,
    symbol: quote.symbol,
    usdPerNative: quote.usdPerNative,
    amount: quote.amount,
    baseUnits: quote.baseUnits.toString(),
    formatted: quote.formatted,
  };
}
