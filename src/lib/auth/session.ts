import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

const COOKIE = "freshmint_session";

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

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
    },
  });

  const jwt = await new SignJWT({ uid: userId, t: hashToken(token) })
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
      if (tokenHash) {
        await prisma.session.deleteMany({ where: { tokenHash } });
      }
    } catch {
      // ignore invalid cookie
    }
  }
  jar.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function getSessionUser() {
  const jar = await cookies();
  const jwt = jar.get(COOKIE)?.value;
  if (!jwt) return null;
  try {
    const { payload } = await jwtVerify(jwt, secretKey());
    const userId = String(payload.uid ?? "");
    const tokenHash = String(payload.t ?? "");
    if (!userId || !tokenHash) return null;

    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: { include: { wallets: true } } },
    });
    if (!session || session.expiresAt.getTime() < Date.now()) {
      return null;
    }
    if (session.userId !== userId) return null;
    return session.user;
  } catch {
    return null;
  }
}
