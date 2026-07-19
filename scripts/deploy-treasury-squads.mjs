/**
 * Create the Squads v4 multisig (2-of-3) whose vault is the Solana treasury.
 * Requires .wallets/secrets.json and a funded payer (SOLANA_MINTER_SECRET_KEY or
 * TREASURY_SOL_PAYER_SECRET_KEY as JSON byte array).
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import bs58 from "bs58";
import * as multisig from "@sqds/multisig";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
loadEnv({ path: path.join(root, ".env") });

const OUT = path.join(root, ".wallets");

function loadKeypairFromEnv() {
  const raw =
    process.env.TREASURY_SOL_PAYER_SECRET_KEY ||
    process.env.SOLANA_MINTER_SECRET_KEY;
  if (!raw) {
    throw new Error(
      "Set SOLANA_MINTER_SECRET_KEY or TREASURY_SOL_PAYER_SECRET_KEY (JSON byte array) to pay rent.",
    );
  }
  const parsed = JSON.parse(raw);
  return Keypair.fromSecretKey(Uint8Array.from(parsed));
}

function keypairFromSecret(entry) {
  if (entry.secretKeyJson) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(entry.secretKeyJson)));
  }
  return Keypair.fromSecretKey(bs58.decode(entry.secretKeyBase58));
}

async function main() {
  const addresses = JSON.parse(await readFile(path.join(OUT, "addresses.json"), "utf8"));
  const secrets = JSON.parse(await readFile(path.join(OUT, "secrets.json"), "utf8"));

  const rpc =
    process.env.SOLANA_RPC_URL ||
    (process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta"
      ? clusterApiUrl("mainnet-beta")
      : clusterApiUrl("devnet"));
  const connection = new Connection(rpc, "confirmed");
  const creator = loadKeypairFromEnv();

  const createKey = keypairFromSecret(secrets.treasury.solanaCreateKey);
  const members = secrets.treasury.solanaMembers.map((m) => ({
    key: new PublicKey(m.publicKey),
    permissions: multisig.Permissions.all(),
  }));

  const [multisigPda] = multisig.getMultisigPda({
    createKey: createKey.publicKey,
  });
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });

  if (vaultPda.toBase58() !== addresses.treasury.solanaSquads.vaultAddress) {
    throw new Error("Vault PDA mismatch vs addresses.json");
  }

  const [programConfigPda] = multisig.getProgramConfigPda({});
  const programConfig =
    await multisig.accounts.ProgramConfig.fromAccountAddress(
      connection,
      programConfigPda,
    );
  const programTreasury = programConfig.treasury;

  const bal = await connection.getBalance(creator.publicKey);
  if (bal < 20_000_000) {
    throw new Error(
      `Payer ${creator.publicKey.toBase58()} needs ~0.02+ SOL on ${rpc} (has ${bal} lamports).`,
    );
  }

  console.log("Creating Squads multisig…");
  console.log("  multisig", multisigPda.toBase58());
  console.log("  vault   ", vaultPda.toBase58());
  console.log("  payer   ", creator.publicKey.toBase58());

  const sig = await multisig.rpc.multisigCreateV2({
    connection,
    treasury: programTreasury,
    createKey,
    creator,
    multisigPda,
    configAuthority: null,
    threshold: 2,
    members,
    timeLock: 0,
    rentCollector: null,
    memo: "FreshMint treasury",
  });

  console.log("signature", sig);
  addresses.treasury.solanaSquads.deployed = true;
  addresses.treasury.solanaSquads.deployedOn = {
    rpc,
    signature: sig,
    at: new Date().toISOString(),
  };
  await writeFile(path.join(OUT, "addresses.json"), JSON.stringify(addresses, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
