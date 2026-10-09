    tokenId,
    txHash: "",
    calldata: "0x",
    status: "pending_wallet",
    walletTx: {
      chain: "boing",
      network: "boing",
      chainId: BOING_TESTNET_CHAIN_ID,
      method: "boing_sendTransaction",
      tx,
    },
  };
}

/**
 * One `boing_sendTransaction` `contract_call` for up to {@link BOING_MINT_BATCH_SIZE}
 * tokens via template v2/v3 `mint_batch` (selector `0x06`). Callers must chunk by
 * {@link boingMintBatchChunkSize} for the collection's stamped version.
 */
export function buildBoingBatchMintIntent(input: {
  creatorAddress: string;
  collectionAddress: string;
  items: { listingId: string; tokenUri: string; title?: string }[];
  collectionTitle?: string;
}): {
  status: "pending_wallet" | "simulated";
  contractAddress: string;
  listingIds: string[];
  provisionalTokenIds: string[];
  txHash: string;
  walletTx: BoingWalletTx;
} {
  if (!input.items.length || input.items.length > BOING_MINT_BATCH_SIZE) {
    throw new Error("boing_mint_batch_size");
  }
  if (!isBoingNativeAccountIdHex(input.collectionAddress)) {
    throw new Error("boing_collection_required");
  }
  if (!isBoingNativeAccountIdHex(input.creatorAddress)) {
    throw new Error("boing_account_id_required");
  }
  const collection = normalizeBoingAccountId(input.collectionAddress);
  const creator = normalizeBoingAccountId(input.creatorAddress);
  const listingIds = input.items.map((i) => i.listingId);
  const provisionalTokenIds = listingIds.map((id) => tokenIdWordForListing(id));
  const metadataHashes = input.items.map((i) =>
    metadataHashWord(i.tokenUri),
  );
  const assetName =
    (input.collectionTitle ?? input.items[0]?.title ?? "FreshMint")
      .trim()
      .slice(0, 32) || "FreshMint";
  const calldata = encodeReferenceMintBatchCalldataHex(
    creator,
    provisionalTokenIds,
    metadataHashes,
  );
  return {
    status: "pending_wallet",
    contractAddress: collection,
    listingIds,
    provisionalTokenIds,
    txHash: "",
    walletTx: {
      chain: "boing",
      network: "boing",
      chainId: BOING_TESTNET_CHAIN_ID,
      method: "boing_sendTransaction",
      tx: {
        type: "contract_call",
        contract: collection,
        to: collection,
        from: creator,
        calldata,
        purpose_category: "nft",
        asset_name: assetName,
        asset_symbol: "FMINT",
      },
    },
  };
}

/**
 * Owner-signed `transfer_nft` for an already-minted Boing reference NFT.
 * CALLER must be the current owner (or admin when the token is still unowned).
 */
export function buildBoingNftTransferIntent(input: {
  collectionAddress: string;
  tokenId: string;
  toAddress: string;
  signerAddress: string;
  listingId?: string;
}): {
  chain: "boing";
  network: "boing";
  contractAddress: string;
  tokenId: string;
  txHash: string;
  calldata: string;
  status: "pending_wallet" | "simulated";
  walletTx: BoingWalletTx;
} {
  const collectionOk = isBoingNativeAccountIdHex(input.collectionAddress);
  const toOk = isBoingNativeAccountIdHex(input.toAddress);
  const signerOk = isBoingNativeAccountIdHex(input.signerAddress);
  const collection = collectionOk
    ? normalizeBoingAccountId(input.collectionAddress)
    : input.collectionAddress;
  const to = toOk ? normalizeBoingAccountId(input.toAddress) : input.toAddress;
  const signer = signerOk
    ? normalizeBoingAccountId(input.signerAddress)
    : input.signerAddress;
  const tokenId = input.tokenId.replace(/^0x/, "");
  const label = (input.listingId ?? "transfer").slice(0, 32);

  if (!collectionOk || !toOk || !signerOk) {
    return {
      chain: "boing",
      network: "boing",
      contractAddress: collection,
      tokenId: input.tokenId,
      txHash: simulatedBoingHash(),
      calldata: "0x",
      status: "simulated",
      walletTx: {
        chain: "boing",
        network: "boing",
        chainId: BOING_TESTNET_CHAIN_ID,
        method: "boing_sendTransaction",
        tx: {
          type: "transfer",
          to,
          from: signer,
          amount: "0",
          purpose_category: "nft",
        },
      },
    };
  }

  return {
    chain: "boing",
    network: "boing",
    contractAddress: collection,
    tokenId: input.tokenId,
    txHash: "",
    calldata: encodeBoingTransferNft(to, tokenId),
    status: "pending_wallet",
    walletTx: {
      chain: "boing",
      network: "boing",
      chainId: BOING_TESTNET_CHAIN_ID,
      method: "boing_sendTransaction",
      tx: {
        type: "contract_call",
        contract: collection,
        to: collection,
        from: signer,
        calldata: encodeBoingTransferNft(to, tokenId),
        purpose_category: "nft",
        asset_name: label,
        asset_symbol: "FMINT",
      },
    },
  };
}

export function buildBoingPurchaseIntent(input: {
  buyerAddress: string;
  listingId: string;
  collection?: string | null;
  tokenId?: string | null;
  amountUsd: number;
  metadataUri?: string;
  title?: string;
}): {
  txHash: string;
  status: "simulated" | "pending_wallet";
  walletTx?: BoingWalletTx;
} {
  const buyerIsBoing = isBoingNativeAccountIdHex(input.buyerAddress);
  const buyer = buyerIsBoing
    ? normalizeBoingAccountId(input.buyerAddress)
    : input.buyerAddress;
  const configured =
    input.collection && isBoingNativeAccountIdHex(input.collection)
      ? normalizeBoingAccountId(input.collection)
      : marketAddressFor("boing");
  const tokenId = (input.tokenId ?? tokenIdWordForListing(input.listingId)).replace(
    /^0x/,
    "",
  );

  if (!buyerIsBoing) {
    return {
      txHash: simulatedBoingHash(),
      status: "simulated",
    };
  }

  if (!configured) {
    const mint = buildBoingMintIntent({
      creatorAddress: buyer,
      metadataUri:
        input.metadataUri ?? `https://freshmint.local/metadata/${input.listingId}`,
      listingId: input.listingId,
      title: input.title ?? input.listingId,
    });
    return {
      txHash: "",
      status: "pending_wallet",
      walletTx: mint.walletTx,
    };
  }

  return {
    txHash: "",
    status: "pending_wallet",
    walletTx: {
      chain: "boing",
      network: "boing",
      chainId: BOING_TESTNET_CHAIN_ID,
      method: "boing_sendTransaction",
      tx: {
        type: "contract_call",
        contract: configured,
        to: configured,
        from: buyer,
        calldata: encodeBoingTransferNft(buyer, tokenId),
        purpose_category: "nft",
        asset_name: `buy:${input.listingId}`.slice(0, 32),
        asset_symbol: "FMINT",
        metadata: {
          listingId: input.listingId,
          tokenId: input.tokenId,
          amountUsd: input.amountUsd,
        },
      },
    },
  };
}

export function simulatedBoingHash(): string {
  return `0x${randomBytes(32).toString("hex")}`;
}
