import { isPostgresConfigured } from "@/lib/env";
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { CreatorProfile } from "@/lib/discovery/types";

export const SESSION_COOKIE = "freshmint_session";
const COOKIE = SESSION_COOKIE;

export function readNamedCookie(
  cookieHeader: string | null | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) === name) {
      try {
        return decodeURIComponent(trimmed.slice(eq + 1));
      } catch {
        return trimmed.slice(eq + 1);
      }
    }
  }
  return undefined;
}

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
  email: string | null;
  googleLinked: boolean;
  hasPassword: boolean;
  avatarUrl: string | null;
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
    email: null,
    googleLinked: false,
    hasPassword: false,
    avatarUrl: null,
  };
}

export function publicSession(user: SessionUser) {
  return {
    id: user.id,
    displayName: user.displayName,
    wallets: user.wallets,
    curatorScore: user.curatorScore,
    verifiedCreator: user.verifiedCreator,
    role: user.role,
    totpEnabled: user.totpEnabled,
    email: user.email,
    googleLinked: user.googleLinked,
    hasPassword: user.hasPassword,
    avatarUrl: user.avatarUrl,
  };
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    maxAge: 7 * 24 * 60 * 60,
  };
}

/** Auth stays on Postgres whenever a DB URL exists — catalog memory fallback must not log people out. */
export function authUsesMemoryStore(): boolean {
  return !isPostgresConfigured();
}

export function applySessionCookie(
  res: NextResponse,
  jwt: string,
  expiresAt: Date,
): NextResponse {
  res.cookies.set(COOKIE, jwt, sessionCookieOptions(expiresAt));
  return res;
}

export function jsonWithSessionCookie(
  body: unknown,
  session: { jwt: string; expiresAt: Date } | null | undefined,
  init?: { status?: number },
) {
  const res = NextResponse.json(body, init);
  if (session?.jwt) applySessionCookie(res, session.jwt, session.expiresAt);
  return res;
}

/** Persist session cookie. In memory mode, JWT-only (no Session table). */
export async function createSession(userId: string): Promise<{
  jwt: string;
  expiresAt: Date;
}> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const tokenHash = hashToken(token);

  const memory = authUsesMemoryStore();
  let persisted = false;

  if (!memory) {
    try {
      await prisma.session.create({
        data: {
          userId,
          tokenHash,
          expiresAt,
        },
      });
      persisted = true;
    } catch {
      // JWT still authenticates the user if the Session row cannot be written.
    }
  }

  const jwt = await new SignJWT({
    uid: userId,
    t: tokenHash,
    mem: memory || !persisted ? 1 : 0,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(secretKey());

  try {
    const jar = await cookies();
    jar.set(COOKIE, jwt, sessionCookieOptions(expiresAt));
  } catch {
    // Route handlers should also call applySessionCookie on the Response.
  }

  return { jwt, expiresAt };
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

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

async function sessionUserFromMemory(userId: string): Promise<SessionUser | null> {
  const { getMemoryState } = await import("@/lib/data/memory-store");
  const creator = getMemoryState().creators.get(userId);
  if (!creator) return null;
  const session = creatorToSession(creator);
  const { getMemoryTotp } = await import("@/lib/auth/totp");
  session.totpEnabled = getMemoryTotp(userId).totpEnabled;
  const { getMemoryAccount } = await import("@/lib/auth/account");
  const account = getMemoryAccount(userId);
  if (account) {
    session.email = account.email;
    session.googleLinked = Boolean(account.googleId);
    session.hasPassword = Boolean(account.passwordHash);
    session.avatarUrl = account.avatarUrl;
  }
  return session;
}

function sessionUserFromDbUser(u: {
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
  email: string | null;
  googleId: string | null;
  passwordHash: string | null;
  avatarUrl: string | null;
}): SessionUser {
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
    email: u.email,
    googleLinked: Boolean(u.googleId),
    hasPassword: Boolean(u.passwordHash),
    avatarUrl: u.avatarUrl,
  };
}

async function resolveSessionUser(jwt: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(jwt, secretKey());
    const userId = String(payload.uid ?? "");
    const tokenHash = String(payload.t ?? "");
    if (!userId) return null;

    if (!authUsesMemoryStore()) {
      try {
        if (payload.mem !== 1 && tokenHash) {
          const session = await prisma.session.findUnique({
            where: { tokenHash },
            include: { user: { include: { wallets: true } } },
          });
          if (
            session &&
            session.userId === userId &&
            session.expiresAt.getTime() >= Date.now()
          ) {
            return sessionUserFromDbUser(session.user);
          }
        }
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: { wallets: true },
        });
        if (user) return sessionUserFromDbUser(user);
      } catch {
        // Fall through to the in-memory catalog.
      }
    }

    return sessionUserFromMemory(userId);
  } catch {
    return null;
  }
}

export async function getSessionUser(req?: {
  cookies: { get: (name: string) => { value: string } | undefined };
  headers?: { get: (name: string) => string | null };
}): Promise<SessionUser | null> {
  const fromRequest = req?.cookies.get(COOKIE)?.value;
  if (fromRequest) return resolveSessionUser(fromRequest);

  const fromRequestHeader = readNamedCookie(req?.headers?.get("cookie"), COOKIE);
  if (fromRequestHeader) return resolveSessionUser(fromRequestHeader);

  try {
    const jwt = (await cookies()).get(COOKIE)?.value;
    if (jwt) return resolveSessionUser(jwt);
  } catch {
    // Some RSC/prefetch contexts throw instead of returning the jar.
  }

  try {
    const jwt = readNamedCookie((await headers()).get("cookie"), COOKIE);
    if (jwt) return resolveSessionUser(jwt);
  } catch {
    // No request context (tests, static generation).
  }

  return null;
}

/** After wallet/demo auth: either create session or return pending 2FA token. */
export async function completeLoginOrChallenge(userId: string): Promise<
  | { ok: true; requires2fa: false; jwt: string; expiresAt: Date }
  | { ok: true; requires2fa: true; pendingToken: string; displayName: string }
> {
  const memory = authUsesMemoryStore();

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

  const session = await createSession(userId);
  return {
    ok: true,
    requires2fa: false,
    jwt: session.jwt,
    expiresAt: session.expiresAt,
  };
}
