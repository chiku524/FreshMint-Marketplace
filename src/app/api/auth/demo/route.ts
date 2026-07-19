import { completeLoginOrChallenge, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ensureDatabaseReady } from "@/lib/db-ready";
import { getMemoryState, isMemoryMode } from "@/lib/data/memory-store";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  userId: z.string().min(1),
});

function demoAuthAllowed() {
  if (process.env.ALLOW_DEMO_AUTH === "true") return true;
  if (process.env.NODE_ENV !== "production") return true;
  if (process.env.VERCEL) return true;
  return false;
}

/** Demo login into seeded personas (no wallet extension required). */
export async function POST(req: NextRequest) {
  if (!demoAuthAllowed()) {
    return NextResponse.json({ error: "disabled" }, { status: 403 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const mode = await ensureDatabaseReady();

  if (mode === "memory" || isMemoryMode()) {
    const creator = getMemoryState().creators.get(body.data.userId);
    if (!creator) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const login = await completeLoginOrChallenge(creator.id);
    if (login.requires2fa) {
      return NextResponse.json({
        ok: true,
        mode: "memory",
        requires2fa: true,
        pendingToken: login.pendingToken,
        displayName: login.displayName,
      });
    }
    return NextResponse.json({
      ok: true,
      mode: "memory",
      requires2fa: false,
      user: {
        id: creator.id,
        displayName: creator.displayName,
        wallets: creator.wallets,
        curatorScore: creator.curatorScore,
        totpEnabled: (await getSessionUser())?.totpEnabled ?? false,
      },
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: body.data.userId },
      include: { wallets: true },
    });
    if (!user) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const login = await completeLoginOrChallenge(user.id);
    if (login.requires2fa) {
      return NextResponse.json({
        ok: true,
        mode: "prisma",
        requires2fa: true,
        pendingToken: login.pendingToken,
        displayName: login.displayName,
      });
    }

    return NextResponse.json({
      ok: true,
      mode: "prisma",
      requires2fa: false,
      user: {
        id: user.id,
        displayName: user.displayName,
        wallets: user.wallets,
        curatorScore: user.curatorScore,
        totpEnabled: user.totpEnabled,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "auth_failed", detail: message }, { status: 500 });
  }
}
