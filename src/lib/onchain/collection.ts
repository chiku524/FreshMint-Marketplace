import { createHash, randomBytes } from "node:crypto";
import { resolveNetwork, vmFromNetwork, type NetworkId } from "@/lib/chains/registry";
import type { Chain } from "@/lib/discovery/types";
import {
  buildBoingMintIntent,
  resolveBoingNftCollectionBytecode,
} from "@/lib/onchain/boing";
import {
  buildEvmBatchMintIntent,
  buildEvmCollectionDeployIntent,
  buildEvmTransferIntent,
  EVM_MINT_BATCH_SIZE,
  type BatchMintIntent,
  type CollectionDeployIntent,
  type WalletTxRequest,
} from "@/lib/onchain/evm";
import { buildSolanaMintIntent } from "@/lib/onchain/solana";
import { isAddress } from "viem";
import { platformFeeRecipients } from "@/lib/fees/platform";

export { EVM_MINT_BATCH_SIZE };

export type AnyWalletTx =
  | WalletTxRequest
  | {
      chain: "solana";
      network: "solana";
      memo?: string;
      feePayer?: string;
      mode: "metaplex" | "memo_fallback";
    }
  | {
      chain: "boing";
      network: "boing";
      chainId: number;
      method: "boing_sendTransaction";
      tx: Record<string, unknown>;
    };

export type CrossChainDeployIntent = {
  chain: Chain;
  network: NetworkId;
  status: "simulated" | "pending_wallet";
  contractAddress: string;
  txHash: string;
  escrowAddress: string;
  walletTx?: AnyWalletTx;
};

export type CrossChainMintBatch = {
  chain: Chain;
  network: NetworkId;
  status: "simulated" | "pending_wallet";
  contractAddress: string;
  escrowAddress: string;
  listingIds: string[];
  provisionalTokenIds: string[];
  txHash: string;
  walletTx?: AnyWalletTx;
};

function escrowFor(chain: Chain, creatorAddress: string): string {
  const fees = platformFeeRecipients();
  if (chain === "solana") {
    return fees.operatorSolana || fees.treasurySolana || creatorAddress;
  }
  if (chain === "boing") {
    return creatorAddress;
  }
  if (fees.operator && isAddress(fees.operator)) return fees.operator;
  if (fees.treasury && isAddress(fees.treasury)) return fees.treasury;
  return creatorAddress;
}

export function buildCollectionDeployIntent(input: {
  collectionId: string;
  title: string;
  creatorAddress: string;
  network: NetworkId | string;
  chain?: Chain;
}): CrossChainDeployIntent {
  const network = resolveNetwork(input.network, input.chain);
  const chain = vmFromNetwork(network);

  if (chain === "evm") {
    const intent = buildEvmCollectionDeployIntent({
      collectionId: input.collectionId,
      title: input.title,
      creatorAddress: input.creatorAddress,
      network,
    });
    return {
      chain: "evm",
      network,
      status: intent.status,
      contractAddress: intent.contractAddress,
      txHash: intent.txHash,
      escrowAddress: intent.escrowAddress,
      walletTx: intent.walletTx,
    };
  }

  if (chain === "boing") {
    const bytecode = resolveBoingNftCollectionBytecode();
    const escrow = escrowFor("boing", input.creatorAddress);
    const simulated = `0x${createHash("sha256")
      .update(`boing-col:${input.collectionId}`)
      .digest("hex")
      .slice(0, 64)}`;
    if (!input.creatorAddress) {
      return {
        chain: "boing",
        network: "boing",
        status: "simulated",
        contractAddress: simulated,
        txHash: `0x${randomBytes(32).toString("hex")}`,
        escrowAddress: escrow,
      };
    }
    return {
      chain: "boing",
      network: "boing",
      status: "pending_wallet",
      contractAddress: simulated,
      txHash: "",
      escrowAddress: escrow,
      walletTx: {
        chain: "boing",
        network: "boing",
        chainId: 6913,
        method: "boing_sendTransaction",
        tx: {
          type: "contract_deploy_meta",
          bytecode,
          purpose_category: "nft",
          asset_name: input.title.trim().slice(0, 32) || "FreshMint",
          asset_symbol: "FMINT",
          from: input.creatorAddress,
        },
      },
    };
  }

  // Solana: collection attestation memo (Metaplex collection asset comes at mint time).
  const escrow = escrowFor("solana", input.creatorAddress);
  const simulated = createHash("sha256")
    .update(`sol-col:${input.collectionId}`)
    .digest("base64url")
    .slice(0, 44);
  const memo = JSON.stringify({
    kind: "freshmint_collection_deploy",
    collectionId: input.collectionId,
    title: input.title,
    creator: input.creatorAddress,
  });
  if (!input.creatorAddress) {
    return {
      chain: "solana",
      network: "solana",
      status: "simulated",
      contractAddress: simulated,
      txHash: `0x${randomBytes(32).toString("hex")}`,
      escrowAddress: escrow,
    };
  }
  return {
    chain: "solana",
    network: "solana",
    status: "pending_wallet",
    contractAddress: simulated,
    txHash: "",
    escrowAddress: escrow,
    walletTx: {
      chain: "solana",
      network: "solana",
      memo,
      feePayer: input.creatorAddress,
      mode: "memo_fallback",
    },
  };
}

export function buildCollectionMintBatches(input: {
  network: NetworkId | string;
  chain?: Chain;
  contractAddress: string;
  creatorAddress: string;
  escrowAddress: string;
  items: { listingId: string; tokenUri: string; title?: string }[];
  startingTokenId?: number;
}): CrossChainMintBatch[] {
  const network = resolveNetwork(input.network, input.chain);
  const chain = vmFromNetwork(network);
  const batches: CrossChainMintBatch[] = [];

  if (chain === "evm") {
    let start = input.startingTokenId ?? 1;
    for (let i = 0; i < input.items.length; i += EVM_MINT_BATCH_SIZE) {
      const slice = input.items.slice(i, i + EVM_MINT_BATCH_SIZE);
      const intent: BatchMintIntent = buildEvmBatchMintIntent({
        network,
        contractAddress: input.contractAddress,
        creatorAddress: input.creatorAddress,
        escrowAddress: input.escrowAddress,
        items: slice,
        startingTokenId: start,
      });
      start += slice.length;
      batches.push({
        chain: "evm",
        network,
        status: intent.status,
        contractAddress: intent.contractAddress,
        escrowAddress: intent.escrowAddress,
        listingIds: intent.listingIds,
        provisionalTokenIds: intent.provisionalTokenIds,
        txHash: intent.txHash,
        walletTx: intent.walletTx,
      });
    }
    return batches;
  }

  // Solana / Boing: one wallet tx per piece (platform still tracks batches for UX).
  for (const item of input.items) {
    if (chain === "boing") {
      const mint = buildBoingMintIntent({
        creatorAddress: input.creatorAddress,
        metadataUri: item.tokenUri,
        listingId: item.listingId,
        title: item.title ?? item.listingId,
      });
      batches.push({
        chain: "boing",
        network: "boing",
        status: mint.status === "pending_wallet" ? "pending_wallet" : "simulated",
        contractAddress: input.contractAddress || mint.contractAddress,
        escrowAddress: input.escrowAddress,
        listingIds: [item.listingId],
        provisionalTokenIds: [mint.tokenId],
        txHash: mint.txHash,
        walletTx: mint.walletTx,
      });
    } else {
      const mint = buildSolanaMintIntent({
        creatorAddress: input.creatorAddress,
        metadataUri: item.tokenUri,
        listingId: item.listingId,
        title: item.title,
      });
      batches.push({
        chain: "solana",
        network: "solana",
        status: "pending_wallet",
        contractAddress: input.contractAddress || mint.contractAddress,
        escrowAddress: input.escrowAddress,
        listingIds: [item.listingId],
        provisionalTokenIds: [mint.tokenId],
        txHash: mint.txHash,
        walletTx: mint.walletTx,
      });
    }
  }
  return batches;
}

export function buildWithdrawTransferIntent(input: {
  network: NetworkId | string;
  chain?: Chain;
  contractAddress: string;
  tokenId: string;
  escrowAddress: string;
  destinationAddress: string;
  signerAddress?: string;
}) {
  const network = resolveNetwork(input.network, input.chain);
  const chain = vmFromNetwork(network);
  if (chain === "evm") {
    return buildEvmTransferIntent({
      network,
      contractAddress: input.contractAddress,
      tokenId: input.tokenId,
      fromAddress: input.escrowAddress,
      toAddress: input.destinationAddress,
      signerAddress: input.signerAddress ?? input.escrowAddress,
    });
  }
  // Solana/Boing: collector wallet still signs a transfer-style mint intent for now.
  if (chain === "boing") {
    return buildBoingMintIntent({
      creatorAddress: input.destinationAddress,
      metadataUri: `transfer:${input.tokenId}`,
      listingId: `withdraw-${input.tokenId}`,
      title: "Withdraw",
    });
  }
  return buildSolanaMintIntent({
    creatorAddress: input.destinationAddress,
    metadataUri: `transfer:${input.tokenId}`,
    listingId: `withdraw-${input.tokenId}`,
    title: "Withdraw",
  });
}
