import { createHash, randomBytes } from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import type { Chain } from "@/lib/discovery/types";
import type { MintIntent } from "./evm";

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

function rpcUrl() {
  return process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
}

function programId(): string {
  return (
    process.env.NEXT_PUBLIC_SOLANA_PROGRAM_ID ??
    MEMO_PROGRAM_ID.toBase58()
  );
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
}): MintIntent & {
  walletTx?: {
    chain: "solana";
    network: string;
    memo: string;
    feePayer?: string;
  };
} {
  const mint = randomBytes(32).toString("base64url").slice(0, 32);
  const tokenId = createHash("sha256")
    .update(input.listingId + mint)
    .digest("hex")
    .slice(0, 16);

  const memo = JSON.stringify({
    kind: "freshmint_mint",
    listingId: input.listingId,
    uri: input.metadataUri,
    creator: input.creatorAddress,
    mint,
  });

  return {
    chain: "solana" as Chain,
    network: process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet",
    contractAddress: programId(),
    tokenId,
    txHash: "",
    // MintIntent.calldata is Hex-typed for EVM; Solana stores memo JSON as a string.
    calldata: memo as MintIntent["calldata"],
    status: "pending_wallet",
    walletTx: {
      chain: "solana",
      network: "devnet",
      memo,
      feePayer: input.creatorAddress,
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
  walletTx?: { chain: "solana"; network: string; memo: string };
} {
  const memo = JSON.stringify({
    kind: "freshmint_buy",
    listingId: input.listingId,
    buyer: input.buyerAddress,
    mint: input.mintAddress,
    lamports: input.priceLamports,
  });

  return {
    txHash: "",
    status: "pending_wallet",
    message: memo,
    walletTx: {
      chain: "solana",
      network: "devnet",
      memo,
    },
  };
}

/** Server-sponsored Devnet memo tx (real on-chain settlement attestation). */
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
