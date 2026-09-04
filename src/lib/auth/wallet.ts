import { randomBytes } from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { blake3 } from "@noble/hashes/blake3";
import { verifyMessage } from "viem";
import { prisma } from "@/lib/db";
import {
  isBoingNativeAccountIdHex,
  normalizeBoingAccountId,
} from "@/lib/onchain/boing";

export type AuthChain = "evm" | "solana" | "boing";

export function normalizeAddress(chain: AuthChain, address: string): string {
  if (chain === "evm") return address.toLowerCase();
  if (chain === "boing") return normalizeBoingAccountId(address);
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

type MemoryNonce = { nonce: string; expiresAt: number };

const nonceGlobal = globalThis as unknown as {
  __freshmintAuthNonces?: Map<string, MemoryNonce>;
};

function memoryNonces(): Map<string, MemoryNonce> {
  if (!nonceGlobal.__freshmintAuthNonces) {
    nonceGlobal.__freshmintAuthNonces = new Map();
  }
  return nonceGlobal.__freshmintAuthNonces;
}

function nonceKey(chain: AuthChain, address: string): string {
  return `${chain}:${address}`;
}

async function useMemoryAuth(): Promise<boolean> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  return mode === "memory" || isMemoryMode();
}

export async function issueNonce(chain: AuthChain, address: string) {
  const normalized = normalizeAddress(chain, address);
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  if (await useMemoryAuth()) {
    memoryNonces().set(nonceKey(chain, normalized), {
      nonce,
      expiresAt: expiresAt.getTime(),
    });
  } else {
    await prisma.authNonce.upsert({
      where: { chain_address: { chain, address: normalized } },
      create: { chain, address: normalized, nonce, expiresAt },
      update: { nonce, expiresAt },
    });
  }

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

  if (await useMemoryAuth()) {
    const key = nonceKey(chain, normalized);
    const row = memoryNonces().get(key);
    if (!row || row.expiresAt < Date.now()) {
      memoryNonces().delete(key);
      return null;
    }
    memoryNonces().delete(key);
    return row.nonce;
  }

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

  if (input.chain === "boing") {
    return verifyBoingSignature(normalized, input.message, input.signature);
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

function decodeSigBytes(signature: string): Uint8Array {
  const raw = signature.trim();
  if (/^(0x)?[0-9a-fA-F]+$/.test(raw) && raw.replace(/^0x/, "").length % 2 === 0) {
    return Uint8Array.from(Buffer.from(raw.replace(/^0x/, ""), "hex"));
  }
  return bs58.decode(raw);
}

function verifyBoingSignature(
  address: string,
  message: string,
  signature: string,
): boolean {
  if (!isBoingNativeAccountIdHex(address)) return false;
  try {
    const publicKey = Uint8Array.from(Buffer.from(address.slice(2), "hex"));
    const sig = decodeSigBytes(signature);
    const utf8 = new TextEncoder().encode(message);
    const hashed = blake3(utf8);
    return (
      nacl.sign.detached.verify(hashed, sig, publicKey) ||
      nacl.sign.detached.verify(utf8, sig, publicKey)
    );
  } catch {
    return false;
  }
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export async function upsertUserFromWallet(input: {
  chain: AuthChain;
  address: string;
  displayName?: string;
}) {
  const address = normalizeAddress(input.chain, input.address);

  if (await useMemoryAuth()) {
    const { getMemoryState } = await import("@/lib/data/memory-store");
    const state = getMemoryState();
    for (const creator of state.creators.values()) {
      if (
        creator.wallets.some((w) => w.chain === input.chain && w.address === address)
      ) {
        return {
          id: creator.id,
          displayName: creator.displayName,
          curatorScore: creator.curatorScore,
          wallets: creator.wallets,
        };
      }
    }
    const userId = `user-${randomBytes(8).toString("hex")}`;
    const created = {
      id: userId,
      displayName: input.displayName ?? `Creator ${shortAddress(address)}`,
      wallets: [{ chain: input.chain, address }],
      firstListingAt: null,
      lifetimePrimaryVolumeUsd: 0,
      completedSales: 0,
      flagged: false,
      washCluster: false,
      verifiedCreator: false,
      walletCreatedAt: Date.now(),
      risingEntriesThisWeek: 0,
      openLaneListingsToday: 0,
      curatorScore: 25,
      establishedBadge: false,
    };
    state.creators.set(userId, created);
    return {
      id: created.id,
      displayName: created.displayName,
      curatorScore: created.curatorScore,
      wallets: created.wallets,
    };
  }

  const existing = await prisma.wallet.findUnique({
    where: { chain_address: { chain: input.chain, address } },
    include: { user: { include: { wallets: true } } },
  });
  if (existing) return existing.user;

  return prisma.user.create({
    data: {
      displayName: input.displayName ?? `Creator ${shortAddress(address)}`,
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

  if (await useMemoryAuth()) {
    const { getMemoryState } = await import("@/lib/data/memory-store");
    const state = getMemoryState();
    for (const creator of state.creators.values()) {
      const match = creator.wallets.find(
        (w) => w.chain === input.chain && w.address === address,
      );
      if (match && creator.id !== input.userId) {
        throw new Error("wallet_already_linked");
      }
      if (match) return { chain: input.chain, address, userId: creator.id };
    }
    const creator = state.creators.get(input.userId);
    if (!creator) throw new Error("user_not_found");
    const wallet = { chain: input.chain, address };
    state.creators.set(input.userId, {
      ...creator,
      wallets: [...creator.wallets, wallet],
    });
    return { ...wallet, userId: input.userId };
  }

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
