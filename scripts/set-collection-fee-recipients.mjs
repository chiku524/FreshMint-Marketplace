/**
 * Update FreshMintERC721 fee recipients to the current platform treasury/operator.
 * Must be signed by the collection contract owner (usually the creator deployer).
 *
 * Usage:
 *   COLLECTION_CONTRACT=0x... COLLECTION_OWNER_PRIVATE_KEY=0x... npm run wallets:set-fee-recipients
 * Optional:
 *   EVM_NETWORK=ethereum (default) | base | arbitrum | optimism
 *   DRY_RUN=1  (read current recipients only)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  isAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  sepolia,
  mainnet,
  base,
  baseSepolia,
  arbitrum,
  arbitrumSepolia,
  optimism,
  optimismSepolia,
} from "viem/chains";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
loadEnv({ path: path.join(root, ".env") });

const mode = (process.env.NEXT_PUBLIC_CHAIN_MODE || "testnet").toLowerCase();
const network = (process.env.EVM_NETWORK || "ethereum").toLowerCase();
const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

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

const abi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "treasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "operatorWallet",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "setFeeRecipients",
    stateMutability: "nonpayable",
    inputs: [
      { name: "treasury_", type: "address" },
      { name: "operatorWallet_", type: "address" },
    ],
    outputs: [],
  },
];

async function main() {
  const chain = CHAINS[network];
  if (!chain) throw new Error(`unsupported EVM_NETWORK=${network}`);
  const rpc = RPC_ENV[network] || chain.rpcUrls.default.http[0];

  const contract = (process.env.COLLECTION_CONTRACT || "").trim();
  if (!isAddress(contract)) {
    throw new Error("COLLECTION_CONTRACT must be a deployed FreshMintERC721 address");
  }

  let treasury = (process.env.NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS || "").trim();
  let operator = (process.env.NEXT_PUBLIC_PLATFORM_OPERATOR_ADDRESS || "").trim();
  if (!isAddress(treasury) || !isAddress(operator)) {
    const addresses = JSON.parse(
      await readFile(path.join(root, ".wallets", "addresses.json"), "utf8")
    );
    treasury = addresses.treasury.evmSafe.address;
    operator = addresses.operator.evm;
  }
  if (!isAddress(treasury) || !isAddress(operator)) {
    throw new Error("missing platform treasury/operator addresses");
  }

  const publicClient = createPublicClient({ chain, transport: http(rpc) });
  const [owner, currentTreasury, currentOperator] = await Promise.all([
    publicClient.readContract({ address: contract, abi, functionName: "owner" }),
    publicClient.readContract({ address: contract, abi, functionName: "treasury" }),
    publicClient.readContract({
      address: contract,
      abi,
      functionName: "operatorWallet",
    }),
  ]);

  console.log({
    network,
    chainId: chain.id,
    contract,
    owner,
    currentTreasury,
    currentOperator,
    nextTreasury: treasury,
    nextOperator: operator,
  });

  if (
    currentTreasury.toLowerCase() === treasury.toLowerCase() &&
    currentOperator.toLowerCase() === operator.toLowerCase()
  ) {
    console.log("already pointing at platform treasury/operator — nothing to do");
    return;
  }

  if (dryRun) {
    console.log("DRY_RUN=1 — skipping setFeeRecipients tx");
    return;
  }

  const pk = (process.env.COLLECTION_OWNER_PRIVATE_KEY || "").trim();
  if (!pk.startsWith("0x")) {
    throw new Error(
      "COLLECTION_OWNER_PRIVATE_KEY required (contract owner). Creators own their collection contracts — platform keys cannot call setFeeRecipients for them."
    );
  }

  const account = privateKeyToAccount(pk);
  if (account.address.toLowerCase() !== String(owner).toLowerCase()) {
    throw new Error(
      `key address ${account.address} is not contract owner ${owner}`
    );
  }

  const wallet = createWalletClient({
    account,
    chain,
    transport: http(rpc),
  });
  const data = encodeFunctionData({
    abi,
    functionName: "setFeeRecipients",
    args: [treasury, operator],
  });
  const hash = await wallet.sendTransaction({
    to: contract,
    data,
    account,
    chain,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log({
    txHash: hash,
    status: receipt.status,
    treasury,
    operator,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
