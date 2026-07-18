import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  userId: z.string().min(1),
});

/** Development / demo login into seeded personas (no wallet extension required). */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_AUTH !== "true") {
    return NextResponse.json({ error: "disabled" }, { status: 403 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

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
    user: {
      id: user.id,
      displayName: user.displayName,
      wallets: user.wallets,
      curatorScore: user.curatorScore,
    },
  });
}
