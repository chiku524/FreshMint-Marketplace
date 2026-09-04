import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword, normalizeEmail, verifyPassword } from "@/lib/auth/password";
import type { GoogleProfile } from "@/lib/auth/google";
import type { CreatorProfile } from "@/lib/discovery/types";

export type AccountRecord = {
  userId: string;
  email: string | null;
  emailVerifiedAt: number | null;
  passwordHash: string | null;
  googleId: string | null;
  avatarUrl: string | null;
};

export class AccountError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "AccountError";
  }
}

type MemoryAccount = AccountRecord;

const g = globalThis as unknown as {
  __freshmintAccounts?: Map<string, MemoryAccount>;
};

export function memoryAccountStore(): Map<string, MemoryAccount> {
  if (!g.__freshmintAccounts) g.__freshmintAccounts = new Map();
  return g.__freshmintAccounts;
}

export function resetMemoryAccountsForTests(): void {
  g.__freshmintAccounts = new Map();
}

function emptyCreator(id: string, displayName: string): CreatorProfile {
  const now = Date.now();
  return {
    id,
    displayName,
    wallets: [],
    firstListingAt: null,
    lifetimePrimaryVolumeUsd: 0,
    completedSales: 0,
    flagged: false,
    washCluster: false,
    verifiedCreator: false,
    walletCreatedAt: now,
    risingEntriesThisWeek: 0,
    openLaneListingsToday: 0,
    curatorScore: 25,
    establishedBadge: false,
  };
}

async function useMemory(): Promise<boolean> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  return mode === "memory" || isMemoryMode();
}

function newUserId(): string {
  return `user-${randomBytes(8).toString("hex")}`;
}

function putMemoryAccount(account: MemoryAccount): void {
  memoryAccountStore().set(account.userId, account);
}

export function getMemoryAccount(userId: string): MemoryAccount | null {
  return memoryAccountStore().get(userId) ?? null;
}

function findMemoryByEmail(email: string): MemoryAccount | null {
  const normalized = normalizeEmail(email);
  for (const account of memoryAccountStore().values()) {
    if (account.email === normalized) return account;
  }
  return null;
}

function findMemoryByGoogleId(googleId: string): MemoryAccount | null {
  for (const account of memoryAccountStore().values()) {
    if (account.googleId === googleId) return account;
  }
  return null;
}

export async function registerWithPassword(input: {
  displayName: string;
  email: string;
  password: string;
}): Promise<{ userId: string }> {
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim();
  if (displayName.length < 1 || displayName.length > 64) {
    throw new AccountError("invalid_display_name");
  }
  if (input.password.length < 8 || input.password.length > 128) {
    throw new AccountError("invalid_password");
  }

  const passwordHash = hashPassword(input.password);

  if (await useMemory()) {
    if (findMemoryByEmail(email)) throw new AccountError("email_taken", 409);
    const { getMemoryState } = await import("@/lib/data/memory-store");
    const userId = newUserId();
    getMemoryState().creators.set(userId, emptyCreator(userId, displayName));
    putMemoryAccount({
      userId,
      email,
      emailVerifiedAt: null,
      passwordHash,
      googleId: null,
      avatarUrl: null,
    });
    return { userId };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AccountError("email_taken", 409);

  const user = await prisma.user.create({
    data: {
      displayName,
      email,
      passwordHash,
      curatorScore: 25,
    },
  });
  return { userId: user.id };
}

export async function loginWithPassword(input: {
  email: string;
  password: string;
}): Promise<{ userId: string }> {
  const email = normalizeEmail(input.email);

  if (await useMemory()) {
    const account = findMemoryByEmail(email);
    if (!account?.passwordHash || !verifyPassword(input.password, account.passwordHash)) {
      throw new AccountError("invalid_credentials", 401);
    }
    return { userId: account.userId };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
    throw new AccountError("invalid_credentials", 401);
  }
  return { userId: user.id };
}

export async function attachPasswordToUser(input: {
  userId: string;
  email: string;
  password: string;
}): Promise<void> {
  const email = normalizeEmail(input.email);
  if (input.password.length < 8 || input.password.length > 128) {
    throw new AccountError("invalid_password");
  }
  const passwordHash = hashPassword(input.password);

  if (await useMemory()) {
    const taken = findMemoryByEmail(email);
    if (taken && taken.userId !== input.userId) {
      throw new AccountError("email_taken", 409);
    }
    const existing = getMemoryAccount(input.userId);
    putMemoryAccount({
      userId: input.userId,
      email,
      emailVerifiedAt: existing?.emailVerifiedAt ?? null,
      passwordHash,
      googleId: existing?.googleId ?? null,
      avatarUrl: existing?.avatarUrl ?? null,
    });
    return;
  }

  const taken = await prisma.user.findUnique({ where: { email } });
  if (taken && taken.id !== input.userId) {
    throw new AccountError("email_taken", 409);
  }
  await prisma.user.update({
    where: { id: input.userId },
    data: { email, passwordHash },
  });
}

export async function upsertUserFromGoogle(
  profile: GoogleProfile,
): Promise<{ userId: string }> {
  const email = normalizeEmail(profile.email);
  const displayName = (profile.name?.trim() || email.split("@")[0] || "Collector").slice(
    0,
    64,
  );
  const avatarUrl = profile.picture ?? null;
  const verifiedAt = profile.verified_email ? Date.now() : null;

  if (await useMemory()) {
    const byGoogle = findMemoryByGoogleId(profile.id);
    if (byGoogle) {
      putMemoryAccount({ ...byGoogle, email, avatarUrl, emailVerifiedAt: verifiedAt });
      return { userId: byGoogle.userId };
    }
    const byEmail = findMemoryByEmail(email);
    if (byEmail) {
      putMemoryAccount({
        ...byEmail,
        googleId: profile.id,
        email,
        avatarUrl: avatarUrl ?? byEmail.avatarUrl,
        emailVerifiedAt: verifiedAt ?? byEmail.emailVerifiedAt,
      });
      return { userId: byEmail.userId };
    }
    const { getMemoryState } = await import("@/lib/data/memory-store");
    const userId = newUserId();
    getMemoryState().creators.set(userId, emptyCreator(userId, displayName));
    putMemoryAccount({
      userId,
      email,
      emailVerifiedAt: verifiedAt,
      passwordHash: null,
      googleId: profile.id,
      avatarUrl,
    });
    return { userId };
  }

  const byGoogle = await prisma.user.findUnique({ where: { googleId: profile.id } });
  if (byGoogle) {
    await prisma.user.update({
      where: { id: byGoogle.id },
      data: {
        email,
        avatarUrl: avatarUrl ?? byGoogle.avatarUrl,
        emailVerifiedAt: profile.verified_email
          ? new Date()
          : byGoogle.emailVerifiedAt,
      },
    });
    return { userId: byGoogle.id };
  }

  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) {
    await prisma.user.update({
      where: { id: byEmail.id },
      data: {
        googleId: profile.id,
        email,
        avatarUrl: avatarUrl ?? byEmail.avatarUrl,
        emailVerifiedAt: profile.verified_email
          ? new Date()
          : byEmail.emailVerifiedAt,
      },
    });
    return { userId: byEmail.id };
  }

  const user = await prisma.user.create({
    data: {
      displayName,
      email,
      googleId: profile.id,
      avatarUrl,
      emailVerifiedAt: profile.verified_email ? new Date() : null,
      curatorScore: 25,
    },
  });
  return { userId: user.id };
}

export async function linkGoogleToUser(input: {
  userId: string;
  profile: GoogleProfile;
}): Promise<void> {
  const email = normalizeEmail(input.profile.email);

  if (await useMemory()) {
    const taken = findMemoryByGoogleId(input.profile.id);
    if (taken && taken.userId !== input.userId) {
      throw new AccountError("google_already_linked", 409);
    }
    const existing = getMemoryAccount(input.userId);
    putMemoryAccount({
      userId: input.userId,
      email: existing?.email ?? email,
      emailVerifiedAt:
        existing?.emailVerifiedAt ??
        (input.profile.verified_email ? Date.now() : null),
      passwordHash: existing?.passwordHash ?? null,
      googleId: input.profile.id,
      avatarUrl: input.profile.picture ?? existing?.avatarUrl ?? null,
    });
    return;
  }

  const taken = await prisma.user.findUnique({
    where: { googleId: input.profile.id },
  });
  if (taken && taken.id !== input.userId) {
    throw new AccountError("google_already_linked", 409);
  }
  await prisma.user.update({
    where: { id: input.userId },
    data: {
      googleId: input.profile.id,
      email: (await prisma.user.findUnique({ where: { id: input.userId } }))?.email ?? email,
      avatarUrl: input.profile.picture,
      emailVerifiedAt: input.profile.verified_email ? new Date() : undefined,
    },
  });
}

export async function updateDisplayName(input: {
  userId: string;
  displayName: string;
}): Promise<void> {
  const displayName = input.displayName.trim();
  if (displayName.length < 1 || displayName.length > 64) {
    throw new AccountError("invalid_display_name");
  }

  if (await useMemory()) {
    const { getMemoryState } = await import("@/lib/data/memory-store");
    const creator = getMemoryState().creators.get(input.userId);
    if (!creator) throw new AccountError("user_not_found", 404);
    getMemoryState().creators.set(input.userId, { ...creator, displayName });
    return;
  }

  await prisma.user.update({
    where: { id: input.userId },
    data: { displayName },
  });
}

export async function getAccountForUser(
  userId: string,
): Promise<AccountRecord | null> {
  if (await useMemory()) {
    return getMemoryAccount(userId);
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      emailVerifiedAt: true,
      passwordHash: true,
      googleId: true,
      avatarUrl: true,
    },
  });
  if (!user) return null;
  return {
    userId: user.id,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt?.getTime() ?? null,
    passwordHash: user.passwordHash,
    googleId: user.googleId,
    avatarUrl: user.avatarUrl,
  };
}
