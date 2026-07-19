/**
 * Deploy the predicted FreshMint treasury Safe (2-of-3) on the configured EVM RPC.
 * Requires .wallets/secrets.json and gas on treasury owner #1.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import Safe from "@safe-global/protocol-kit";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia, mainnet, base, baseSepolia, arbitrum, arbitrumSepolia, optimism, optimismSepolia } from "viem/chains";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
loadEnv({ path: path.join(root, ".env") });

const OUT = path.join(root, ".wallets");
const mode = (process.env.NEXT_PUBLIC_CHAIN_MODE || "testnet").toLowerCase();
const network = (process.env.SAFE_DEPLOY_NETWORK || "ethereum").toLowerCase();

const CHAINS = {
  ethereum: mode === "mainnet" ? mainnet : sepolia,
  base: mode === "mainnet" ? base : baseSepolia,
  arbitrum: mode === "mainnet" ? arbitrum : arbitrumSepolia,
  optimism: mode === "mainnet" ? optimism : optimismSepolia,
};

const RPC_ENV = {
  ethereum: process.env.EVM_RPC_URL_ETHEREUM || process.env.EVM_RPC_URL,
  base: process.env.EVM_RPC_URL_BASE,
  arbitrum: process.env.EVM_RPC_URL_ARBITRUM,
  optimism: process.env.EVM_RPC_URL_OPTIMISM,
};

async function main() {
  const chain = CHAINS[network];
  if (!chain) throw new Error(`unsupported SAFE_DEPLOY_NETWORK=${network}`);
  const rpc =
    RPC_ENV[network] ||
    chain.rpcUrls.default.http[0];

  const addresses = JSON.parse(await readFile(path.join(OUT, "addresses.json"), "utf8"));
  const secrets = JSON.parse(await readFile(path.join(OUT, "secrets.json"), "utf8"));
  const owners = secrets.treasury.evmOwners.map((o) => o.address);
  const deployerKey = secrets.treasury.evmOwners[0].privateKey;
  const saltNonce = addresses.treasury.evmSafe.saltNonce;

  const protocolKit = await Safe.init({
    provider: rpc,
    signer: deployerKey,
    predictedSafe: {
      safeAccountConfig: { owners, threshold: 2 },
      safeDeploymentConfig: { saltNonce },
    },
  });

  const predicted = await protocolKit.getAddress();
  if (predicted.toLowerCase() !== addresses.treasury.evmSafe.address.toLowerCase()) {
    throw new Error(
      `Predicted Safe mismatch: ${predicted} vs ${addresses.treasury.evmSafe.address}`,
    );
  }

  const account = privateKeyToAccount(deployerKey);
  const publicClient = createPublicClient({ chain, transport: http(rpc) });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpc),
  });

  const bal = await publicClient.getBalance({ address: account.address });
  if (bal === 0n) {
    throw new Error(
      `Treasury owner #1 ${account.address} has 0 balance on ${chain.name}. Fund Sepolia/mainnet ETH, then retry.`,
    );
  }

  console.log(`Deploying Safe on ${chain.name} via ${account.address}…`);
  const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction();
  const hash = await walletClient.sendTransaction({
    to: deploymentTransaction.to,
    value: BigInt(deploymentTransaction.value || "0"),
    data: deploymentTransaction.data,
  });
  console.log("tx", hash);
  await publicClient.waitForTransactionReceipt({ hash });

  const live = await protocolKit.connect({ safeAddress: predicted });
  const deployed = await live.isSafeDeployed();
  console.log("deployed", deployed, predicted);

  addresses.treasury.evmSafe.deployed = deployed;
  addresses.treasury.evmSafe.deployedOn = {
    network,
    chainId: chain.id,
    txHash: hash,
    at: new Date().toISOString(),
  };
  await writeFile(path.join(OUT, "addresses.json"), JSON.stringify(addresses, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
