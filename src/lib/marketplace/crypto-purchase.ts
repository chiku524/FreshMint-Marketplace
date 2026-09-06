import {
  getNetwork,
  isNetworkId,
  listBridgeNetworks,
  resolveNetwork,
  vmFromNetwork,
  type NetworkId,
} from "@/lib/chains/registry";
import type { Chain } from "@/lib/discovery/types";
import {
  quoteNativeFromUsd,
  quotePayInFromUsdAt,
  publicNativeQuote,
} from "@/lib/onchain/fx";
import { buildWithdrawTransferIntent } from "@/lib/onchain/collection";
import {
  quoteNativeBridge,
  type BridgeQuoteResult,
} from "@/lib/bridge/relay";
import { platformFeeRecipients, splitSaleProceeds } from "@/lib/fees/platform";
import { isAddress } from "viem";

const FALLBACK_EVM = "0x0000000000000000000000000000000000000001";
const FALLBACK_SOL = "11111111111111111111111111111111";

export function settlementAddressFor(network: NetworkId): string {
  const fees = platformFeeRecipients();
  const vm = vmFromNetwork(network);
  if (vm === "solana") {
    return fees.treasurySolana || fees.operatorSolana || FALLBACK_SOL;
  }
  if (vm === "boing") {
    return fees.treasury || fees.operator || FALLBACK_EVM;
  }
  return fees.treasury || fees.operator || FALLBACK_EVM;
}

export function payNetworksForListing(listingNetwork: NetworkId): NetworkId[] {
  if (listingNetwork === "boing") return ["boing"];
  const bridgeable = listBridgeNetworks().map((n) => n.id);
  return [
    listingNetwork,
    ...bridgeable.filter((id) => id !== listingNetwork),
  ];
}

export function assertCryptoPayAllowed(input: {
  listingNetwork: NetworkId;
  payNetwork: NetworkId;
}): { ok: true } | { ok: false; error: string } {
  if (!isNetworkId(input.payNetwork) || !isNetworkId(input.listingNetwork)) {
    return { ok: false, error: "invalid_network" };
  }
  if (input.listingNetwork === "boing" && input.payNetwork !== "boing") {
    return { ok: false, error: "boing_same_chain_only" };
  }
  if (input.payNetwork === "boing" && input.listingNetwork !== "boing") {
    return { ok: false, error: "boing_same_chain_only" };
  }
  return { ok: true };
}

export function listingIsMinted(listing: {
  tokenId?: string | null;
  contractAddress?: string | null;
  mintTxHash?: string | null;
}): boolean {
  return Boolean(
    listing.tokenId && listing.contractAddress && listing.mintTxHash,
  );
}

export async function buildNativePaymentWalletTx(input: {
  network: NetworkId;
  fromAddress: string;
  toAddress: string;
  amountUsd: number;
  listingChain: Chain;
}): Promise<{
  walletTx: Record<string, unknown>;
  quote: ReturnType<typeof quoteNativeFromUsd>;
}> {
  const quote = quoteNativeFromUsd(input.amountUsd, input.listingChain);
  const def = getNetwork(input.network);
  if (def.vm === "evm" && def.chainId != null) {
    return {
      quote,
      walletTx: {
        chain: "evm",
        network: input.network,
        chainId: def.chainId,
        to: input.toAddress,
        data: "0x",
        value: `0x${quote.baseUnits.toString(16)}`,
        from: isAddress(input.fromAddress) ? input.fromAddress : undefined,
      },
    };
  }
  if (def.vm === "solana") {
    const { buildSolanaPurchaseTransactionBase64 } = await import(
      "@/lib/onchain/solana"
    );
    const lamports = Number(quote.baseUnits);
    try {
      const built = await buildSolanaPurchaseTransactionBase64({
        feePayer: input.fromAddress,
        memo: JSON.stringify({
          kind: "freshmint_payment",
          amountUsd: input.amountUsd,
        }),
        payoutAddress: input.toAddress,
        lamports: Number.isFinite(lamports) ? lamports : 0,
      });
      return {
        quote,
        walletTx: {
          chain: "solana",
          network: "solana",
          serialized: built.serialized,
          feePayer: input.fromAddress,
        },
      };
    } catch {
      return {
        quote,
        walletTx: {
          chain: "solana",
          network: "solana",
          mode: "memo_fallback",
          feePayer: input.fromAddress,
          memo: JSON.stringify({
            kind: "freshmint_payment",
            to: input.toAddress,
            amount: quote.formatted,
            amountUsd: input.amountUsd,
          }),
        },
      };
    }
  }
  return {
    quote,
    walletTx: {
      chain: "boing",
      network: "boing",
      chainId: 6913,
      method: "boing_sendTransaction",
      tx: {
        type: "transfer",
        to: input.toAddress,
        from: input.fromAddress,
        amount: quote.formatted,
        purpose_category: "payment",
      },
    },
  };
}

export async function buildCrossChainPayQuote(input: {
  listingNetwork: NetworkId;
  payNetwork: NetworkId;
  amountUsd: number;
  buyerPaymentAddress: string;
  settlementAddress: string;
}): Promise<{
  settle: ReturnType<typeof quoteNativeFromUsd>;
  pay: ReturnType<typeof quoteNativeFromUsd>;
  bridged: boolean;
  bridge?: BridgeQuoteResult;
}> {
  const listingChain = vmFromNetwork(input.listingNetwork);
  const quotes = quotePayInFromUsdAt({
    amountUsd: input.amountUsd,
    listingChain,
    payNetwork: input.payNetwork,
  });
  const bridged = input.payNetwork !== input.listingNetwork;
  if (!bridged) {
    return { bridged: false, settle: quotes.settle, pay: quotes.pay };
  }
  const digits = quotes.pay.symbol === "SOL" ? 4 : 6;
  const bridge = await quoteNativeBridge({
    fromNetwork: input.payNetwork,
    toNetwork: input.listingNetwork,
    amount: quotes.pay.amount.toFixed(digits),
    userAddress: input.buyerPaymentAddress,
    recipientAddress: input.settlementAddress,
  });
  return {
    bridged: true,
    settle: quotes.settle,
    pay: quotes.pay,
    bridge,
  };
}

export function buildPurchaseTransferIntent(input: {
  listingNetwork: NetworkId;
  listingChain: Chain;
  contractAddress: string;
  tokenId: string;
  escrowAddress: string;
  buyerReceiveAddress: string;
}) {
  return buildWithdrawTransferIntent({
    network: input.listingNetwork,
    chain: input.listingChain,
    contractAddress: input.contractAddress,
    tokenId: input.tokenId,
    escrowAddress: input.escrowAddress,
    destinationAddress: input.buyerReceiveAddress,
  });
}

export function resolveListingNetwork(
  network: string | null | undefined,
  chain: Chain,
): NetworkId {
  return resolveNetwork(network, chain);
}

export function publicPayQuote(input: {
  settle: ReturnType<typeof quoteNativeFromUsd>;
  pay: ReturnType<typeof quoteNativeFromUsd>;
  bridged: boolean;
}) {
  return {
    settle: publicNativeQuote(input.settle),
    pay: publicNativeQuote(input.pay),
    bridged: input.bridged,
  };
}

export { splitSaleProceeds, publicNativeQuote };
