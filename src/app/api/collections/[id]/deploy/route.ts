import { getSessionUser } from "@/lib/auth/session";
import { confirmCollectionDeploy } from "@/lib/marketplace/service";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  txHash: z.string().min(8),
  contractAddress: z.string().min(1).optional(),
  escrowAddress: z.string().min(1).optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await confirmCollectionDeploy({
    collectionId: id,
    creatorId: user.id,
    txHash: body.data.txHash,
    contractAddress: body.data.contractAddress,
    escrowAddress: body.data.escrowAddress,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
