import { createHash, randomBytes } from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createV1, mplCore } from "@metaplex-foundation/mpl-core";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createSignerFromKeypair,
  generateSigner,
  publicKey,
  signerIdentity,
} from "@metaplex-foundation/umi";
import {
  fromWeb3JsKeypair,
  toWeb3JsLegacyTransaction,
} from "@metaplex-foundation/umi-web3js-adapters";
import { rpcUrlFor } from "@/lib/chains/registry";
import type { Chain } from "@/lib/discovery/types";
import type { MintIntent } from "./evm";

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

function rpcUrl() {
  return rpcUrlFor("solana");
}

function metaplexEnabled(): boolean {
  return process.env.SOLANA_MINT_MODE !== "memo";
}

function loadServerKeypair(): Keypair | null {
  const raw = process.env.SOLANA_MINTER_SECRET_KEY;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  } catch {
    return null;
  }
}

export function buildSolanaMintIntent(input: {
  creatorAddress: string;
  metadataUri: string;
  listingId: string;
  title?: string;
}): MintIntent & {
  walletTx?: {
    chain: "solana";
    network: "solana";
    memo?: string;
    feePayer?: string;
    mode: "metaplex" | "memo_fallback";
  };
  assetAddress?: string;
} {
  const assetSeed = randomBytes(32).toString("base64url").slice(0, 32);
  const tokenId = createHash("sha256")
    .update(input.listingId + assetSeed)
    .digest("hex")
    .slice(0, 16);

  const mode = metaplexEnabled() ? "metaplex" : "memo_fallback";
  const memo = JSON.stringify({
    kind: "freshmint_mint",
    mode,
    listingId: input.listingId,
    uri: input.metadataUri,
    creator: input.creatorAddress,
    title: input.title ?? input.listingId,
    assetSeed,
  });

  return {
    chain: "solana" as Chain,
    network: "solana",
    contractAddress: mode === "metaplex" ? "metaplex-core" : MEMO_PROGRAM_ID.toBase58(),
    tokenId,
    txHash: "",
    calldata: memo as MintIntent["calldata"],
    status: "pending_wallet",
    walletTx: {
      chain: "solana",
      network: "solana",
      memo,
      feePayer: input.creatorAddress,
      mode,
    },
  };
}

export function buildSolanaPurchaseIntent(input: {
  buyerAddress: string;
  mintAddress: string;
  priceLamports: number;
  listingId?: string;
}): {
  txHash: string;
  status: "simulated" | "pending_wallet";
  message: string;
  walletTx?: {
    chain: "solana";
    network: "solana";
    memo: string;
    mode: "memo_fallback";
  };
} {
  const feeBps = { treasury: 150, operator: 100, total: 250 };
  const memo = JSON.stringify({
    kind: "freshmint_buy",
    listingId: input.listingId,
    buyer: input.buyerAddress,
    mint: input.mintAddress,
    lamports: input.priceLamports,
    platformFeeBps: feeBps,
  });

  return {
    txHash: "",
    status: "pending_wallet",
    message: memo,
    walletTx: {
      chain: "solana",
      network: "solana",
      memo,
      mode: "memo_fallback",
    },
  };
}

/** Build a Metaplex Core createV1 tx for the creator wallet to sign. */
export async function buildSolanaMetaplexMintTransactionBase64(input: {
  feePayer: string;
  metadataUri: string;
  name: string;
}): Promise<{ serialized: string; assetAddress: string }> {
  const umi = createUmi(rpcUrl()).use(mplCore());
  const asset = generateSigner(umi);
  // Fee payer must sign; use a dummy identity then replace with web3 tx feePayer
  const ephemeral = Keypair.generate();
  const umiKeypair = fromWeb3JsKeypair(ephemeral);
  umi.use(signerIdentity(createSignerFromKeypair(umi, umiKeypair)));

  const builder = createV1(umi, {
    asset,
    name: input.name.slice(0, 32),
    uri: input.metadataUri,
    owner: publicKey(input.feePayer),
  });

  const umiTx = await builder.buildWithLatestBlockhash(umi);
  const web3Tx = toWeb3JsLegacyTransaction(umiTx);
  web3Tx.feePayer = new PublicKey(input.feePayer);
  // Asset keypair must co-sign; fee payer signs in the wallet.
  web3Tx.partialSign(Keypair.fromSecretKey(Uint8Array.from(asset.secretKey)));

  const serialized = web3Tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64");

  return { serialized, assetAddress: asset.publicKey.toString() };
}

/** Server-sponsored Metaplex Core mint on Devnet (optional). */
export async function sendSolanaMetaplexMintWithServerKey(input: {
  metadataUri: string;
  name: string;
  ownerAddress: string;
}): Promise<{ txHash: string; assetAddress: string } | null> {
  const keypair = loadServerKeypair();
  if (!keypair || !metaplexEnabled()) return null;

  const umi = createUmi(rpcUrl()).use(mplCore());
  const umiKeypair = fromWeb3JsKeypair(keypair);
  umi.use(signerIdentity(createSignerFromKeypair(umi, umiKeypair)));
  const asset = generateSigner(umi);

  const builder = createV1(umi, {
    asset,
    name: input.name.slice(0, 32),
    uri: input.metadataUri,
    owner: publicKey(input.ownerAddress),
  });
  const result = await builder.sendAndConfirm(umi);
  const sig = Buffer.from(result.signature).toString("base64");
  // umi signature is bytes — convert to base58 via web3
  const { default: bs58 } = await import("bs58");
  const txHash = bs58.encode(Buffer.from(result.signature));

  return { txHash: txHash || sig, assetAddress: asset.publicKey.toString() };
}

/** Server-sponsored Devnet memo tx (fallback attestation). */
export async function sendSolanaMemoWithServerKey(memo: string): Promise<{
  txHash: string;
} | null> {
  const keypair = loadServerKeypair();
  if (!keypair) return null;

  const connection = new Connection(rpcUrl(), "confirmed");
  const ix = new TransactionInstruction({
    keys: [{ pubkey: keypair.publicKey, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, "utf8"),
  });
  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [keypair], {
    commitment: "confirmed",
  });
  return { txHash: sig };
}

export async function buildSolanaMemoTransactionBase64(input: {
  feePayer: string;
  memo: string;
}): Promise<string> {
  const connection = new Connection(rpcUrl(), "confirmed");
  const payer = new PublicKey(input.feePayer);
  const ix = new TransactionInstruction({
    keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(input.memo, "utf8"),
  });
  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction({
    feePayer: payer,
    recentBlockhash: blockhash,
  }).add(ix);
  return tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64");
}

export async function buildSolanaMintTransactionBase64(input: {
  feePayer: string;
  metadataUri: string;
  name: string;
  listingId: string;
}): Promise<{ serialized: string; assetAddress?: string; mode: string }> {
  if (metaplexEnabled()) {
    try {
      const mx = await buildSolanaMetaplexMintTransactionBase64({
        feePayer: input.feePayer,
        metadataUri: input.metadataUri,
        name: input.name,
      });
      return { ...mx, mode: "metaplex" };
    } catch {
      // fall through to memo
    }
  }
  const intent = buildSolanaMintIntent({
    creatorAddress: input.feePayer,
    metadataUri: input.metadataUri,
    listingId: input.listingId,
    title: input.name,
  });
  const serialized = await buildSolanaMemoTransactionBase64({
    feePayer: input.feePayer,
    memo: String(intent.calldata),
  });
  return { serialized, mode: "memo_fallback" };
}

export async function verifySolanaTx(txHash: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (!txHash || txHash.length < 8) return { ok: false, error: "invalid_hash" };
  try {
    const connection = new Connection(rpcUrl(), "confirmed");
    const status = await connection.getSignatureStatus(txHash);
    const v = status.value;
    if (!v) return { ok: false, error: "not_found" };
    if (v.err) return { ok: false, error: "tx_failed" };
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "verify_failed",
    };
  }
}
