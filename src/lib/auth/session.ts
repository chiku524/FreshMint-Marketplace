import "@/lib/env";
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import type { CreatorProfile } from "@/lib/discovery/types";

const COOKIE = "freshmint_session";

export type SessionUser = {
  id: string;
  displayName: string;
  wallets: { chain: string; address: string }[];
  curatorScore: number;
  verifiedCreator: boolean;
  role: string;
  flagged: boolean;
  washCluster: boolean;
  firstListingAt: Date | null;
  lifetimePrimaryVolumeUsd: number;
  completedSales: number;
  walletCreatedAt: Date;
  risingEntriesThisWeek: number;
  openLaneListingsToday: number;
  establishedBadge: boolean;
  totpEnabled: boolean;
};

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET must be set (min 16 chars)");
  }
  return new TextEncoder().encode(secret);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function creatorToSession(creator: CreatorProfile): SessionUser {
  // Lazy import avoided — memory TOTP looked up by callers when needed.
  return {
    id: creator.id,
    displayName: creator.displayName,
    wallets: creator.wallets,
    curatorScore: creator.curatorScore,
    verifiedCreator: creator.verifiedCreator,
    role: creator.id.startsWith("mod-")
      ? "moderator"
      : creator.id.startsWith("curator-")
        ? "editor"
        : "member",
    flagged: creator.flagged,
    washCluster: creator.washCluster,
    firstListingAt: creator.firstListingAt
      ? new Date(creator.firstListingAt)
      : null,
    lifetimePrimaryVolumeUsd: creator.lifetimePrimaryVolumeUsd,
    completedSales: creator.completedSales,
    walletCreatedAt: new Date(creator.walletCreatedAt),
    risingEntriesThisWeek: creator.risingEntriesThisWeek,
    openLaneListingsToday: creator.openLaneListingsToday,
    establishedBadge: creator.establishedBadge,
    totpEnabled: false,
  };
}

/** Persist session cookie. In memory mode, JWT-only (no Session table). */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const tokenHash = hashToken(token);

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  const memory = mode === "memory" || isMemoryMode();

  if (!memory) {
    await prisma.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  }

  const jwt = await new SignJWT({
    uid: userId,
    t: tokenHash,
    mem: memory ? 1 : 0,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(secretKey());

  const jar = await cookies();
  jar.set(COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return jwt;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const jwt = jar.get(COOKIE)?.value;
  if (jwt) {
    try {
      const { payload } = await jwtVerify(jwt, secretKey());
      const tokenHash = String(payload.t ?? "");
      const { isMemoryMode } = await import("@/lib/data/memory-store");
      if (tokenHash && !isMemoryMode() && !payload.mem) {
        await prisma.session.deleteMany({ where: { tokenHash } });
      }
    } catch {
      // ignore invalid cookie
    }
  }
  jar.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const jwt = jar.get(COOKIE)?.value;
  if (!jwt) return null;
  try {
    const { payload } = await jwtVerify(jwt, secretKey());
    const userId = String(payload.uid ?? "");
    const tokenHash = String(payload.t ?? "");
    if (!userId || !tokenHash) return null;

    const { ensureDatabaseReady } = await import("@/lib/db-ready");
    const { getMemoryState, isMemoryMode } = await import(
      "@/lib/data/memory-store"
    );
    const mode = await ensureDatabaseReady();
    const memory = mode === "memory" || isMemoryMode() || payload.mem === 1;

    if (memory) {
      const creator = getMemoryState().creators.get(userId);
      if (!creator) return null;
      const session = creatorToSession(creator);
      const { getMemoryTotp } = await import("@/lib/auth/totp");
      session.totpEnabled = getMemoryTotp(userId).totpEnabled;
      return session;
    }

    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: { include: { wallets: true } } },
    });
    if (!session || session.expiresAt.getTime() < Date.now()) {
      return null;
    }
    if (session.userId !== userId) return null;
    const u = session.user;
    return {
      id: u.id,
      displayName: u.displayName,
      wallets: u.wallets,
      curatorScore: u.curatorScore,
      verifiedCreator: u.verifiedCreator,
      role: u.role,
      flagged: u.flagged,
      washCluster: u.washCluster,
      firstListingAt: u.firstListingAt,
      lifetimePrimaryVolumeUsd: u.lifetimePrimaryVolumeUsd,
      completedSales: u.completedSales,
      walletCreatedAt: u.walletCreatedAt,
      risingEntriesThisWeek: u.risingEntriesThisWeek,
      openLaneListingsToday: u.openLaneListingsToday,
      establishedBadge: u.establishedBadge,
      totpEnabled: u.totpEnabled,
    };
  } catch {
    return null;
  }
}

/** After wallet/demo auth: either create session or return pending 2FA token. */
export async function completeLoginOrChallenge(userId: string): Promise<
  | { ok: true; requires2fa: false }
  | { ok: true; requires2fa: true; pendingToken: string; displayName: string }
> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  const memory = mode === "memory" || isMemoryMode();

  let totpEnabled = false;
  let displayName = userId;

  if (memory) {
    const { getMemoryState } = await import("@/lib/data/memory-store");
    const { getMemoryTotp } = await import("@/lib/auth/totp");
    const creator = getMemoryState().creators.get(userId);
    if (!creator) throw new Error("user_not_found");
    displayName = creator.displayName;
    totpEnabled = getMemoryTotp(userId).totpEnabled;
  } else {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("user_not_found");
    displayName = user.displayName;
    totpEnabled = user.totpEnabled;
  }

  if (totpEnabled) {
    const { createPending2faToken } = await import("@/lib/auth/totp");
    const pendingToken = await createPending2faToken(userId);
    return { ok: true, requires2fa: true, pendingToken, displayName };
  }

  await createSession(userId);
  return { ok: true, requires2fa: false };
}
