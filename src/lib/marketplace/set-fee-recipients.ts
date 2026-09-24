import {
  getNetwork,
  isNetworkId,
  resolveNetwork,
  vmFromNetwork,
  type NetworkId,
} from "@/lib/chains/registry";
import { platformFeeRecipients } from "@/lib/fees/platform";
import type { Collection } from "@/lib/discovery/types";
import {
  buildEvmSetFeeRecipientsIntent,
  readEvmCollectionOwner,
} from "@/lib/onchain/evm";
import { getDiscoveryEngine } from "@/lib/marketplace/service";

async function loadOwnedCollection(input: {
  actorId: string;
  collectionId: string;
}): Promise<
  | { ok: true; collection: Collection }
  | { ok: false; error: string }
> {
  const engine = await getDiscoveryEngine();
  const collection = engine.state.collections.get(input.collectionId);
  if (!collection) return { ok: false, error: "collection_not_found" };
  if (collection.creatorId !== input.actorId) {
    return { ok: false, error: "forbidden" };
  }
  return { ok: true, collection };
}

function resolveCollectionNetwork(
  collection: Collection,
): { ok: true; network: NetworkId } | { ok: false; error: string } {
  const network = resolveNetwork(
    collection.network as string | undefined,
    collection.chain,
  );
  if (!isNetworkId(network)) return { ok: false, error: "invalid_network" };
  return { ok: true, network };
}

/**
 * Prepare a collection-owner wallet tx to retarget on-chain fee recipients
 * to the current platform treasury/operator (setFeeRecipients).
 * Does not change baked-in fee BPS.
 */
export async function prepareCollectionSetFeeRecipients(input: {
  actorId: string;
  collectionId: string;
  fromAddress: string;
}): Promise<
  | {
      ok: true;
      network: NetworkId;
      contractAddress: string;
      feeRecipients: ReturnType<typeof platformFeeRecipients>;
      walletTx: NonNullable<
        ReturnType<typeof buildEvmSetFeeRecipientsIntent>["walletTx"]
      >;
      status: "pending_wallet";
    }
  | {
      ok: false;
      error: string;
      connected?: string;
      onchainOwner?: string;
    }
> {
  const loaded = await loadOwnedCollection(input);
  if (!loaded.ok) return loaded;

  const { collection } = loaded;
  if (collection.chain !== "evm") {
    return { ok: false, error: "evm_only" };
  }
  if (
    collection.deployStatus !== "confirmed" ||
    !collection.contractAddress ||
    collection.contractAddress.startsWith("pending:")
  ) {
    return { ok: false, error: "collection_not_deployed" };
  }

  const net = resolveCollectionNetwork(collection);
  if (!net.ok) return net;
  if (vmFromNetwork(net.network) !== "evm") {
    return { ok: false, error: "evm_only" };
  }
  const def = getNetwork(net.network);
  if (def.vm !== "evm") return { ok: false, error: "evm_only" };

  const fromAddress = input.fromAddress?.trim();
  if (!fromAddress) return { ok: false, error: "wallet_required" };

  const onchainOwner = await readEvmCollectionOwner({
    network: net.network,
    contractAddress: collection.contractAddress,
  });
  if (!onchainOwner.ok) {
    return { ok: false, error: "owner_read_failed" };
  }
  if (onchainOwner.owner.toLowerCase() !== fromAddress.toLowerCase()) {
    return {
      ok: false,
      error: "not_onchain_owner",
      connected: fromAddress,
      onchainOwner: onchainOwner.owner,
    };
  }

  let intent: ReturnType<typeof buildEvmSetFeeRecipientsIntent>;
  try {
    intent = buildEvmSetFeeRecipientsIntent({
      network: net.network,
      contractAddress: collection.contractAddress,
      ownerAddress: fromAddress,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "intent_failed";
    if (msg.startsWith("invalid_contract")) {
      return { ok: false, error: "invalid_contract" };
    }
    if (msg.startsWith("evm_fee_recipients_requires_evm_network")) {
      return { ok: false, error: "evm_only" };
    }
    return { ok: false, error: "intent_failed" };
  }

  if (!intent.walletTx || intent.status !== "pending_wallet") {
    return { ok: false, error: "wallet_required" };
  }

  return {
    ok: true,
    network: net.network,
    contractAddress: collection.contractAddress,
    feeRecipients: platformFeeRecipients(),
    walletTx: intent.walletTx,
    status: "pending_wallet",
  };
}
