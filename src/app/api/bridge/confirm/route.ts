import { getSessionUser } from "@/lib/auth/session";
import { getRelayStatus } from "@/lib/bridge/relay";
import { prisma } from "@/lib/db";
import { ensureDatabaseReady } from "@/lib/db-ready";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  transferId: z.string().optional(),
  requestId: z.string().optional(),
  txHashes: z.array(z.string()).default([]),
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

  let status = "submitted";
  let raw: unknown = {};
  if (body.data.requestId) {
    try {
      const s = await getRelayStatus(body.data.requestId);
      status = s.status.toLowerCase().includes("success")
        ? "completed"
        : s.status.toLowerCase().includes("fail")
          ? "failed"
          : s.status || "submitted";
      raw = s.raw;
    } catch {
      status = "submitted";
    }
  }

  await ensureDatabaseReady();
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  if (!isMemoryMode() && body.data.transferId) {
    await prisma.bridgeTransfer.update({
      where: { id: body.data.transferId },
      data: {
        status,
        requestId: body.data.requestId ?? undefined,
        txHashesJson: JSON.stringify(body.data.txHashes),
        quoteJson: JSON.stringify(raw),
      },
    });
  }

  return NextResponse.json({
    ok: true,
    status,
    requestId: body.data.requestId,
    txHashes: body.data.txHashes,
  });
}
