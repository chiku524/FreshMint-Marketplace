import { getSessionUser } from "@/lib/auth/session";
import {
  normalizeAddress,
  unlinkWalletFromUser,
  type AuthChain,
} from "@/lib/auth/wallet";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  chain: z.enum(["evm", "solana", "boing"]),
  address: z.string().min(8),
});

/** Remove a linked wallet from the signed-in profile (account link only). */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const chain = body.data.chain as AuthChain;
  const address = normalizeAddress(chain, body.data.address);

  try {
    const wallet = await unlinkWalletFromUser({
      userId: user.id,
      chain,
      address,
    });
    return NextResponse.json({ ok: true, wallet });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unlink_failed";
    const status =
      msg === "unauthorized"
        ? 401
        : msg === "wallet_not_found"
          ? 404
          : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
