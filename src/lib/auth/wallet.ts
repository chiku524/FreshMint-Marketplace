import { randomBytes } from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { verifyMessage } from "viem";
import { prisma } from "@/lib/db";

export type AuthChain = "evm" | "solana";

export function normalizeAddress(chain: AuthChain, address: string): string {
  if (chain === "evm") return address.toLowerCase();
  return address.trim();
}

export function buildSignMessage(input: {
  appName: string;
  address: string;
  chain: AuthChain;
  nonce: string;
}): string {
  return [
    `${input.appName} wants you to sign in`,
    "",
    `Chain: ${input.chain}`,
    `Address: ${input.address}`,
    `Nonce: ${input.nonce}`,
    "",
    "This signature proves wallet ownership. No gas is spent.",
  ].join("\n");
}

export async function issueNonce(chain: AuthChain, address: string) {
  const normalized = normalizeAddress(chain, address);
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.authNonce.upsert({
    where: { chain_address: { chain, address: normalized } },
    create: { chain, address: normalized, nonce, expiresAt },
    update: { nonce, expiresAt },
  });
  return {
    nonce,
    message: buildSignMessage({
      appName: process.env.NEXT_PUBLIC_APP_NAME ?? "FreshMint Marketplace",
      address: normalized,
      chain,
      nonce,
    }),
    expiresAt,
  };
}

export async function consumeNonce(chain: AuthChain, address: string) {
  const normalized = normalizeAddress(chain, address);
  const row = await prisma.authNonce.findUnique({
    where: { chain_address: { chain, address: normalized } },
  });
  if (!row || row.expiresAt.getTime() < Date.now()) {
    return null;
  }
  await prisma.authNonce.delete({
    where: { chain_address: { chain, address: normalized } },
  });
  return row.nonce;
}

export async function verifyWalletSignature(input: {
  chain: AuthChain;
  address: string;
  message: string;
  signature: string;
}): Promise<boolean> {
  const normalized = normalizeAddress(input.chain, input.address);
  if (input.chain === "evm") {
    return verifyMessage({
      address: normalized as `0x${string}`,
      message: input.message,
      signature: input.signature as `0x${string}`,
    });
  }

  // Solana: ed25519 over UTF-8 message bytes
  try {
    const publicKey = bs58.decode(normalized);
    const signature = bs58.decode(input.signature);
    const msg = new TextEncoder().encode(input.message);
    return nacl.sign.detached.verify(msg, signature, publicKey);
  } catch {
    return false;
  }
}

export async function upsertUserFromWallet(input: {
  chain: AuthChain;
  address: string;
  displayName?: string;
}) {
  const address = normalizeAddress(input.chain, input.address);
  const existing = await prisma.wallet.findUnique({
    where: { chain_address: { chain: input.chain, address } },
    include: { user: { include: { wallets: true } } },
  });
  if (existing) return existing.user;

  const short =
    input.chain === "evm"
      ? `${address.slice(0, 6)}…${address.slice(-4)}`
      : `${address.slice(0, 4)}…${address.slice(-4)}`;

  return prisma.user.create({
    data: {
      displayName: input.displayName ?? `Creator ${short}`,
      curatorScore: 25,
      wallets: {
        create: { chain: input.chain, address },
      },
    },
    include: { wallets: true },
  });
}

export async function linkWalletToUser(input: {
  userId: string;
  chain: AuthChain;
  address: string;
}) {
  const address = normalizeAddress(input.chain, input.address);
  const taken = await prisma.wallet.findUnique({
    where: { chain_address: { chain: input.chain, address } },
  });
  if (taken && taken.userId !== input.userId) {
    throw new Error("wallet_already_linked");
  }
  if (taken) return taken;
  return prisma.wallet.create({
    data: { userId: input.userId, chain: input.chain, address },
  });
}
