import { getSessionUser } from "@/lib/auth/session";
import { isNetworkId } from "@/lib/chains/registry";
import { quoteNativeBridge } from "@/lib/bridge/relay";
import { prisma } from "@/lib/db";
import { ensureDatabaseReady } from "@/lib/db-ready";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  fromNetwork: z.enum(["ethereum", "base", "arbitrum", "optimism", "solana"]),
  toNetwork: z.enum(["ethereum", "base", "arbitrum", "optimism", "solana"]),
  amount: z.string().min(1),
  userAddress: z.string().min(4),
  recipientAddress: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json(
      { error: "invalid_body", details: body.error.flatten() },
      { status: 400 },
    );
  }
  if (
    !isNetworkId(body.data.fromNetwork) ||
    !isNetworkId(body.data.toNetwork)
  ) {
    return NextResponse.json({ error: "invalid_network" }, { status: 400 });
  }

  try {
    const quote = await quoteNativeBridge(body.data);
    await ensureDatabaseReady();
    const { isMemoryMode } = await import("@/lib/data/memory-store");
    let transferId: string | null = null;
    if (!isMemoryMode()) {
      const row = await prisma.bridgeTransfer.create({
        data: {
          userId: user.id,
          fromNetwork: body.data.fromNetwork,
          toNetwork: body.data.toNetwork,
          amount: body.data.amount,
          requestId: quote.requestId ?? null,
          status: "quoted",
          quoteJson: JSON.stringify(quote.raw ?? {}),
        },
      });
      transferId = row.id;
    }
    return NextResponse.json({ ok: true, quote, transferId });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "quote_failed",
      },
      { status: 502 },
    );
  }
}
