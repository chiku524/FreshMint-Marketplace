import { issueNonce, type AuthChain } from "@/lib/auth/wallet";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  chain: z.enum(["evm", "solana"]),
  address: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const result = await issueNonce(body.data.chain as AuthChain, body.data.address);
  return NextResponse.json(result);
}
