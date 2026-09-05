import type { Chain } from "@/lib/discovery/types";
import type { NetworkId } from "@/lib/chains/registry";

export type NativeSymbol = "ETH" | "SOL" | "BOING";

export type NativeQuote = {
  amountUsd: number;
  chain: Chain;
  symbol: NativeSymbol;
  usdPerNative: number;
  amount: number;
  baseUnits: bigint;
  formatted: string;
  source: "live" | "env" | "fallback";
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

const LIVE_TTL_MS = 60_000;

type LiveCache = {
  at: number;
  rates: Partial<Record<NativeSymbol, number>>;
};

let liveCache: LiveCache | null = null;

export function nativeSymbolForChain(chain: Chain): NativeSymbol {
  if (chain === "solana") return "SOL";
  if (chain === "boing") return "BOING";
  return "ETH";
}

export function nativeSymbolForNetwork(network: NetworkId): NativeSymbol {
  if (network === "solana") return "SOL";
  if (network === "boing") return "BOING";
  return "ETH";
}

function envRate(symbol: NativeSymbol): number | null {
  const raw = process.env[RATE_ENV[symbol]];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function resetLiveRatesForTests() {
  liveCache = null;
}

export function usdPerNative(
  symbol: NativeSymbol,
  live?: Partial<Record<NativeSymbol, number>>,
): { rate: number; source: NativeQuote["source"] } {
  const liveRate = live?.[symbol] ?? liveCache?.rates[symbol];
  if (liveRate && liveRate > 0) return { rate: liveRate, source: "live" };
  const fromEnv = envRate(symbol);
  if (fromEnv) return { rate: fromEnv, source: "env" };
  return { rate: DEFAULT_USD_PER_NATIVE[symbol], source: "fallback" };
}

export async function fetchLiveUsdRates(): Promise<
  Partial<Record<NativeSymbol, number>>
> {
  if (liveCache && Date.now() - liveCache.at < LIVE_TTL_MS) {
    return liveCache.rates;
  }
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,solana&vs_currencies=usd",
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
    if (!res.ok) throw new Error(`spot_${res.status}`);
    const data = (await res.json()) as {
      ethereum?: { usd?: number };
      solana?: { usd?: number };
    };
    const rates: Partial<Record<NativeSymbol, number>> = {};
    if (Number(data.ethereum?.usd) > 0) rates.ETH = Number(data.ethereum?.usd);
    if (Number(data.solana?.usd) > 0) rates.SOL = Number(data.solana?.usd);
    liveCache = { at: Date.now(), rates };
    return rates;
  } catch {
    return liveCache?.rates ?? {};
  }
}

export function baseUnitsFromUsd(
  amountUsd: number,
  symbol: NativeSymbol,
  live?: Partial<Record<NativeSymbol, number>>,
): bigint {
  const { rate } = usdPerNative(symbol, live);
  const decimals = DECIMALS[symbol];
  const amount = Math.max(0, amountUsd) / rate;
  return BigInt(Math.max(0, Math.round(amount * 10 ** decimals)));
}

export function quoteNativeFromUsd(
  amountUsd: number,
  chain: Chain,
  live?: Partial<Record<NativeSymbol, number>>,
): NativeQuote {
  const symbol = nativeSymbolForChain(chain);
  const { rate, source } = usdPerNative(symbol, live);
  const amount = Math.max(0, amountUsd) / rate;
  const baseUnits = baseUnitsFromUsd(amountUsd, symbol, live);
  const digits = symbol === "SOL" ? 4 : 6;
  return {
    amountUsd,
    chain,
    symbol,
    usdPerNative: rate,
    amount,
    baseUnits,
    formatted: `${amount.toFixed(digits)} ${symbol}`,
    source,
  };
}

export async function quoteNativeFromUsdLive(
  amountUsd: number,
  chain: Chain,
): Promise<NativeQuote> {
  const live = await fetchLiveUsdRates();
  return quoteNativeFromUsd(amountUsd, chain, live);
}

export function quotePayInFromUsdAt(
  input: {
    amountUsd: number;
    listingChain: Chain;
    payNetwork: NetworkId;
  },
  live?: Partial<Record<NativeSymbol, number>>,
): {
  settle: NativeQuote;
  pay: NativeQuote;
  bridged: boolean;
} {
  const settle = quoteNativeFromUsd(input.amountUsd, input.listingChain, live);
  const payChain: Chain =
    input.payNetwork === "solana"
      ? "solana"
      : input.payNetwork === "boing"
        ? "boing"
        : "evm";
  const pay = quoteNativeFromUsd(input.amountUsd, payChain, live);
  return {
    settle,
    pay,
    bridged: payChain !== input.listingChain,
  };
}

export async function quotePayInFromUsd(input: {
  amountUsd: number;
  listingChain: Chain;
  payNetwork: NetworkId;
}): Promise<{
  settle: NativeQuote;
  pay: NativeQuote;
  bridged: boolean;
}> {
  const live = await fetchLiveUsdRates();
  return quotePayInFromUsdAt(input, live);
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
    source: quote.source,
  };
}
