import { getSessionUser } from "@/lib/auth/session";
import { extractWalletSteps, quoteNativeBridge } from "@/lib/bridge/relay";
import { isNetworkId } from "@/lib/chains/registry";
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
  transferId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (
    !isNetworkId(body.data.fromNetwork) ||
    !isNetworkId(body.data.toNetwork)
  ) {
    return NextResponse.json({ error: "invalid_network" }, { status: 400 });
  }

  try {
    const quote = await quoteNativeBridge(body.data);
    const walletSteps = extractWalletSteps(quote);

    await ensureDatabaseReady();
    const { isMemoryMode } = await import("@/lib/data/memory-store");
    if (!isMemoryMode() && body.data.transferId) {
      await prisma.bridgeTransfer.update({
        where: { id: body.data.transferId },
        data: {
          status: "prepared",
          requestId: quote.requestId ?? undefined,
          quoteJson: JSON.stringify(quote.raw ?? {}),
        },
      });
    }

    return NextResponse.json({
      ok: true,
      quote,
      walletSteps,
      requestId: quote.requestId,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "prepare_failed" },
      { status: 502 },
    );
  }
}
