/**
 * Generate FreshMint platform wallets:
 * - Operator: normal EVM EOA + Solana keypair (1% fee recipient)
 * - Treasury: EVM Safe 2-of-3 + Solana Squads vault 2-of-3 (1.5% fee recipient)
 *
 * Secrets are written to .wallets/ (gitignored). Re-run refuses to overwrite
 * unless FORCE_WALLET_CREATE=1.
 */
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import Safe from "@safe-global/protocol-kit";
import * as squads from "@sqds/multisig";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
loadEnv({ path: path.join(root, ".env") });

const OUT = path.join(root, ".wallets");
const FORCE = process.env.FORCE_WALLET_CREATE === "1";
const SALT_NONCE = process.env.SAFE_SALT_NONCE ?? "20260719001";
const RPC =
  process.env.EVM_RPC_URL_ETHEREUM ||
  process.env.EVM_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function solKeypair() {
  return Keypair.generate();
}

function solBundle(kp) {
  return {
    publicKey: kp.publicKey.toBase58(),
    secretKeyBase58: bs58.encode(kp.secretKey),
    secretKeyJson: `[${Array.from(kp.secretKey).join(",")}]`,
  };
}

function evmBundle(privateKey) {
  const account = privateKeyToAccount(privateKey);
  return { address: account.address, privateKey };
}

async function predictSafeAddress(owners, threshold, signerPrivateKey) {
  const protocolKit = await Safe.init({
    provider: RPC,
    signer: signerPrivateKey,
    predictedSafe: {
      safeAccountConfig: { owners, threshold },
      safeDeploymentConfig: {
        saltNonce: SALT_NONCE,
      },
    },
  });
  return protocolKit.getAddress();
}

async function main() {
  const marker = path.join(OUT, "addresses.json");
  if ((await exists(marker)) && !FORCE) {
    console.error(
      `.wallets/ already exists. Refusing to overwrite.\n` +
        `Set FORCE_WALLET_CREATE=1 to regenerate (you will lose access to prior keys unless backed up).`,
    );
    process.exit(1);
  }

  await mkdir(OUT, { recursive: true });

  const operatorEvm = evmBundle(generatePrivateKey());
  const operatorSol = solBundle(solKeypair());

  const treasuryOwnersEvm = [
    evmBundle(generatePrivateKey()),
    evmBundle(generatePrivateKey()),
    evmBundle(generatePrivateKey()),
  ];
  const treasuryMembersSol = [solKeypair(), solKeypair(), solKeypair()];
  const squadsCreateKey = solKeypair();

  const [multisigPda] = squads.getMultisigPda({
    createKey: squadsCreateKey.publicKey,
  });
  const [vaultPda] = squads.getVaultPda({
    multisigPda,
    index: 0,
  });

  console.log("Predicting Safe address via", RPC, "…");
  const safeAddress = await predictSafeAddress(
    treasuryOwnersEvm.map((o) => o.address),
    2,
    treasuryOwnersEvm[0].privateKey,
  );

  const createdAt = new Date().toISOString();
  const fingerprint = createHash("sha256")
    .update(safeAddress + vaultPda.toBase58() + operatorEvm.address)
    .digest("hex")
    .slice(0, 16);

  const publicAddresses = {
    createdAt,
    fingerprint,
    feeSplit: {
      totalBps: 250,
      treasuryBps: 150,
      operatorBps: 100,
    },
    operator: {
      evm: operatorEvm.address,
      solana: operatorSol.publicKey,
    },
    treasury: {
      evmSafe: {
        address: safeAddress,
        threshold: 2,
        owners: treasuryOwnersEvm.map((o) => o.address),
        saltNonce: SALT_NONCE,
        deployed: false,
        networkHint: "Deploy once per chain (Sepolia first) with wallets:deploy-safe",
      },
      solanaSquads: {
        vaultAddress: vaultPda.toBase58(),
        multisigPda: multisigPda.toBase58(),
        createKey: squadsCreateKey.publicKey.toBase58(),
        threshold: 2,
        members: treasuryMembersSol.map((k) => k.publicKey.toBase58()),
        vaultIndex: 0,
        deployed: false,
        networkHint: "Create on Devnet/Mainnet with wallets:deploy-squads",
      },
    },
  };

  const secrets = {
    warning:
      "PRIVATE KEYS — never commit, never share. Fund/deploy only after offline backup.",
    createdAt,
    fingerprint,
    operator: {
      evm: operatorEvm,
      solana: operatorSol,
    },
    treasury: {
      evmOwners: treasuryOwnersEvm.map((o, i) => ({
        index: i + 1,
        role: "safe_owner",
        ...o,
      })),
      solanaMembers: treasuryMembersSol.map((kp, i) => ({
        index: i + 1,
        role: "squads_member",
        ...solBundle(kp),
      })),
      solanaCreateKey: {
        role: "squads_create_key",
        ...solBundle(squadsCreateKey),
      },
    },
  };

  const envSnippet = [
    `# FreshMint platform fee recipients (generated ${createdAt})`,
    `NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS="${safeAddress}"`,
    `NEXT_PUBLIC_PLATFORM_TREASURY_SOLANA="${vaultPda.toBase58()}"`,
    `NEXT_PUBLIC_PLATFORM_OPERATOR_ADDRESS="${operatorEvm.address}"`,
    `NEXT_PUBLIC_PLATFORM_OPERATOR_SOLANA="${operatorSol.publicKey}"`,
    "",
  ].join("\n");

  const vault = vaultPda.toBase58();
  const readme = [
    "# FreshMint platform wallets",
    "",
    `Generated: ${createdAt}`,
    `Fingerprint: ${fingerprint}`,
    "",
    "## Public addresses (safe to share / put in Vercel env)",
    "",
    "| Role | Chain | Address |",
    "|------|-------|---------|",
    `| Treasury (1.5%) | EVM Safe 2-of-3 | \`${safeAddress}\` |`,
    `| Treasury (1.5%) | Solana Squads vault | \`${vault}\` |`,
    `| Operator (1%) | EVM EOA | \`${operatorEvm.address}\` |`,
    `| Operator (1%) | Solana | \`${operatorSol.publicKey}\` |`,
    "",
    "## Files",
    "",
    "- `addresses.json` — public only",
    "- `secrets.json` — **private keys** (backup offline, then delete local copies if desired)",
    "- `env.snippet` — paste into `.env` / Vercel",
    "",
    "## Activate on-chain",
    "",
    "1. **Backup** `secrets.json` to a password manager / offline store (all 3 treasury signers + create key + operator).",
    "2. Fund treasury owner #1 with a little Sepolia ETH, then:",
    "   `npm run wallets:deploy-safe`",
    "3. Fund a Solana payer (or set `SOLANA_MINTER_SECRET_KEY`), then:",
    "   `npm run wallets:deploy-squads`",
    "4. Redeploy `FreshMintERC721` with treasury=Safe and operator=EOA constructor args.",
    "",
    "Until deploy steps run, addresses are still valid fee destinations once markets send to them; the Safe/Squads must exist before you can spend treasury funds under multisig rules.",
    "",
  ].join("\n");

  await writeFile(path.join(OUT, "addresses.json"), JSON.stringify(publicAddresses, null, 2));
  await writeFile(path.join(OUT, "secrets.json"), JSON.stringify(secrets, null, 2));
  await writeFile(path.join(OUT, "env.snippet"), envSnippet);
  await writeFile(path.join(OUT, "README.md"), readme);

  // Merge public fee addresses into local .env if present
  const envPath = path.join(root, ".env");
  if (await exists(envPath)) {
    let envText = await readFile(envPath, "utf8");
    const pairs = {
      NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS: safeAddress,
      NEXT_PUBLIC_PLATFORM_TREASURY_SOLANA: vaultPda.toBase58(),
      NEXT_PUBLIC_PLATFORM_OPERATOR_ADDRESS: operatorEvm.address,
      NEXT_PUBLIC_PLATFORM_OPERATOR_SOLANA: operatorSol.publicKey,
    };
    for (const [key, value] of Object.entries(pairs)) {
      const line = `${key}="${value}"`;
      const re = new RegExp(`^${key}=.*$`, "m");
      if (re.test(envText)) {
        envText = envText.replace(re, line);
      } else {
        envText = `${envText.trimEnd()}\n\n${line}\n`;
      }
    }
    await writeFile(envPath, envText);
  }

  console.log("\nCreated platform wallets in .wallets/");
  console.log(readme);
  console.log("\nPrivate keys are ONLY in .wallets/secrets.json — back them up now.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
