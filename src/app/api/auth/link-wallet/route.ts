import { getSessionUser } from "@/lib/auth/session";
import {
  buildSignMessage,
  consumeNonce,
  linkWalletToUser,
  normalizeAddress,
  verifyWalletSignature,
  type AuthChain,
} from "@/lib/auth/wallet";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  chain: z.enum(["evm", "solana"]),
  address: z.string().min(8),
  signature: z.string().min(8),
});

/** Link an additional chain wallet to the signed-in creator profile. */
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
  const nonce = await consumeNonce(chain, address);
  if (!nonce) {
    return NextResponse.json({ error: "nonce_expired" }, { status: 401 });
  }

  const message = buildSignMessage({
    appName: process.env.NEXT_PUBLIC_APP_NAME ?? "FreshMint Marketplace",
    address,
    chain,
    nonce,
  });

  const valid = await verifyWalletSignature({
    chain,
    address,
    message,
    signature: body.data.signature,
  });
  if (!valid) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  try {
    const wallet = await linkWalletToUser({
      userId: user.id,
      chain,
      address,
    });
    return NextResponse.json({ ok: true, wallet });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "link_failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
