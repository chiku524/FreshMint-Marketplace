/**
 * Send small testnet top-ups into the platform treasuries so Safe/Squads have gas.
 * Sepolia: owner #1 → Safe
 * Devnet: create key → Squads vault
 *
 * Usage: npm run wallets:fund-treasuries
 * Optional: FUND_ETH=0.02 FUND_SOL=0.5
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
loadEnv({ path: path.join(root, ".env") });

async function fundEvm(addresses, secrets) {
  const rpc =
    process.env.EVM_RPC_URL_ETHEREUM ||
    "https://ethereum-sepolia-rpc.publicnode.com";
  const amount = process.env.FUND_ETH || "0.02";
  const safe = addresses.treasury.evmSafe.address;
  const pk = secrets.treasury.evmOwners[0].privateKey;
  const account = privateKeyToAccount(pk);
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpc),
  });
  const wallet = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpc),
  });
  const beforeFrom = await publicClient.getBalance({ address: account.address });
  const beforeSafe = await publicClient.getBalance({ address: safe });
  console.log("evm before", {
    from: account.address,
    fromEth: formatEther(beforeFrom),
    safe,
    safeEth: formatEther(beforeSafe),
  });
  const hash = await wallet.sendTransaction({
    to: safe,
    value: parseEther(amount),
    account,
    chain: sepolia,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const afterSafe = await publicClient.getBalance({ address: safe });
  console.log("evm funded", {
    txHash: hash,
    status: receipt.status,
    amountEth: amount,
    safeEth: formatEther(afterSafe),
  });
}

async function fundSol(addresses, secrets) {
  const rpc = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const amountSol = Number(process.env.FUND_SOL || "0.5");
  const vault = new PublicKey(addresses.treasury.solanaSquads.vaultAddress);
  const secret = secrets.treasury.solanaCreateKey.secretKeyJson
    ? Uint8Array.from(JSON.parse(secrets.treasury.solanaCreateKey.secretKeyJson))
    : bs58.decode(secrets.treasury.solanaCreateKey.secretKeyBase58);
  const payer = Keypair.fromSecretKey(secret);
  const conn = new Connection(rpc, "confirmed");
  const beforeFrom = await conn.getBalance(payer.publicKey);
  const beforeVault = await conn.getBalance(vault);
  console.log("sol before", {
    from: payer.publicKey.toBase58(),
    fromSol: beforeFrom / LAMPORTS_PER_SOL,
    vault: vault.toBase58(),
    vaultSol: beforeVault / LAMPORTS_PER_SOL,
  });
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: vault,
      lamports: Math.round(amountSol * LAMPORTS_PER_SOL),
    })
  );
  const sig = await sendAndConfirmTransaction(conn, tx, [payer]);
  const afterVault = await conn.getBalance(vault);
  console.log("sol funded", {
    signature: sig,
    amountSol,
    vaultSol: afterVault / LAMPORTS_PER_SOL,
  });
}

async function main() {
  const addresses = JSON.parse(
    await readFile(path.join(root, ".wallets", "addresses.json"), "utf8")
  );
  const secrets = JSON.parse(
    await readFile(path.join(root, ".wallets", "secrets.json"), "utf8")
  );
  await fundEvm(addresses, secrets);
  await fundSol(addresses, secrets);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
