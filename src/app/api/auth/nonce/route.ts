import { limitByIp } from "@/lib/http/rate-limit";
import { readJsonBody, invalidBody } from "@/lib/http/json";
import { issueNonce, type AuthChain } from "@/lib/auth/wallet";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  chain: z.enum(["evm", "solana", "boing"]),
  address: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const limited = await limitByIp(req, "auth:nonce", 30, 5 * 60_000);
  if (limited) return limited;
  const body = schema.safeParse(await readJsonBody(req));
  if (!body.success) {
    return invalidBody(body.error);
  }
  const result = await issueNonce(body.data.chain as AuthChain, body.data.address);
  return NextResponse.json(result);
}
