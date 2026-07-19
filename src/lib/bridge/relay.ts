import {
  MAINNET_RELAY_API,
  TESTNET_RELAY_API,
  createClient,
  getClient,
} from "@relayprotocol/relay-sdk";
import {
  chainMode,
  getNetwork,
  listBridgeNetworks,
  type NetworkId,
} from "@/lib/chains/registry";

let configured = false;

/** Relay numeric chain ids used by the protocol (Solana uses a custom id). */
const RELAY_CHAIN_ID: Record<NetworkId, number> = {
  ethereum: chainMode() === "mainnet" ? 1 : 11155111,
  base: chainMode() === "mainnet" ? 8453 : 84532,
  arbitrum: chainMode() === "mainnet" ? 42161 : 421614,
  optimism: chainMode() === "mainnet" ? 10 : 11155420,
  // Relay Solana mainnet id; testnet may map similarly — override via env
  solana: Number(process.env.RELAY_SOLANA_CHAIN_ID ?? "792703809"),
};

export function relayApiBase(): string {
  return chainMode() === "mainnet" ? MAINNET_RELAY_API : TESTNET_RELAY_API;
}

export function ensureRelayClient() {
  if (configured) {
    try {
      return getClient();
    } catch {
      configured = false;
    }
  }
  createClient({
    baseApiUrl: relayApiBase(),
    source: process.env.NEXT_PUBLIC_RELAY_SOURCE ?? "freshmint.marketplace",
  });
  configured = true;
  return getClient();
}

export function relayChainId(network: NetworkId): number {
  return RELAY_CHAIN_ID[network];
}

export function bridgeableNetworks() {
  return listBridgeNetworks().map((n) => ({
    id: n.id,
    label: n.label,
    nativeSymbol: n.nativeSymbol,
    vm: n.vm,
    relayChainId: relayChainId(n.id),
  }));
}

export interface BridgeQuoteRequest {
  fromNetwork: NetworkId;
  toNetwork: NetworkId;
  amount: string;
  userAddress: string;
  recipientAddress?: string;
}

export interface BridgeQuoteResult {
  requestId?: string;
  fromNetwork: NetworkId;
  toNetwork: NetworkId;
  amount: string;
  estimatedOutput?: string;
  feeUsd?: string;
  raw: unknown;
  steps?: unknown[];
}

async function relayFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${relayApiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (data as { message?: string })?.message ??
      (data as { error?: string })?.error ??
      `relay_${res.status}`;
    throw new Error(msg);
  }
  return data;
}

/**
 * Quote a native gas transfer via Relay intents API.
 * Amount is in human units (e.g. "0.01" ETH/SOL).
 */
export async function quoteNativeBridge(
  input: BridgeQuoteRequest,
): Promise<BridgeQuoteResult> {
  ensureRelayClient();
  const from = getNetwork(input.fromNetwork);
  const to = getNetwork(input.toNetwork);
  if (input.fromNetwork === input.toNetwork) {
    throw new Error("same_network");
  }

  const originChainId = relayChainId(input.fromNetwork);
  const destinationChainId = relayChainId(input.toNetwork);

  // Convert human amount to base units string for Relay
  const decimals = from.decimals;
  const [whole, frac = ""] = input.amount.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const amountBase =
    BigInt(whole || "0") * BigInt(10) ** BigInt(decimals) +
    BigInt(fracPadded || "0");

  const currency =
    from.vm === "solana"
      ? "11111111111111111111111111111111"
      : "0x0000000000000000000000000000000000000000";
  const toCurrency =
    to.vm === "solana"
      ? "11111111111111111111111111111111"
      : "0x0000000000000000000000000000000000000000";

  const body = {
    user: input.userAddress,
    recipient: input.recipientAddress ?? input.userAddress,
    originChainId,
    destinationChainId,
    originCurrency: currency,
    destinationCurrency: toCurrency,
    amount: amountBase.toString(),
    tradeType: "EXACT_INPUT",
  };

  const raw = await relayFetch("/quote/v2", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const steps = (raw as { steps?: unknown[] })?.steps;
  const requestId =
    (raw as { requestId?: string })?.requestId ??
    (raw as { quotes?: { requestId?: string }[] })?.quotes?.[0]?.requestId;

  const fees = (raw as { fees?: { gas?: { amountUsd?: string } } })?.fees;
  const details = raw as {
    details?: { currencyOut?: { amountFormatted?: string } };
  };

  return {
    requestId,
    fromNetwork: input.fromNetwork,
    toNetwork: input.toNetwork,
    amount: input.amount,
    estimatedOutput: details?.details?.currencyOut?.amountFormatted,
    feeUsd: fees?.gas?.amountUsd,
    raw,
    steps,
  };
}

export async function getRelayStatus(requestId: string): Promise<{
  status: string;
  raw: unknown;
}> {
  const raw = await relayFetch(
    `/intents/status/v3?requestId=${encodeURIComponent(requestId)}`,
  );
  const status =
    (raw as { status?: string })?.status ??
    (raw as { data?: { status?: string } })?.data?.status ??
    "unknown";
  return { status, raw };
}

export function extractWalletSteps(quote: BridgeQuoteResult): {
  chain: "evm" | "solana";
  chainId?: number;
  to?: string;
  data?: string;
  value?: string;
  serialized?: string;
}[] {
  const steps = (quote.steps ??
    (quote.raw as { steps?: unknown[] })?.steps ??
    []) as Array<{
    kind?: string;
    items?: Array<{
      data?: {
        to?: string;
        data?: string;
        value?: string;
        chainId?: number;
        instructions?: unknown;
      };
    }>;
  }>;

  const out: {
    chain: "evm" | "solana";
    chainId?: number;
    to?: string;
    data?: string;
    value?: string;
  }[] = [];

  for (const step of steps) {
    for (const item of step.items ?? []) {
      const d = item.data;
      if (!d) continue;
      if (d.to && d.data != null) {
        out.push({
          chain: "evm",
          chainId: d.chainId,
          to: d.to,
          data: d.data,
          value: d.value ?? "0x0",
        });
      }
    }
  }
  return out;
}
