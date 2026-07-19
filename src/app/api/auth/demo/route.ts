import { createSession } from "@/lib/auth/session";
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
  // Preview demos on Vercel
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
    await createSession(creator.id);
    return NextResponse.json({
      ok: true,
      mode: "memory",
      user: {
        id: creator.id,
        displayName: creator.displayName,
        wallets: creator.wallets,
        curatorScore: creator.curatorScore,
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

    await createSession(user.id);
    return NextResponse.json({
      ok: true,
      mode: "prisma",
      user: {
        id: user.id,
        displayName: user.displayName,
        wallets: user.wallets,
        curatorScore: user.curatorScore,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "auth_failed", detail: message }, { status: 500 });
  }
}
