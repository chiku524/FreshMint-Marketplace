import { completeLoginOrChallenge, getSessionUser } from "@/lib/auth/session";
import {
  buildSignMessage,
  consumeNonce,
  normalizeAddress,
  upsertUserFromWallet,
  verifyWalletSignature,
  type AuthChain,
} from "@/lib/auth/wallet";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  chain: z.enum(["evm", "solana"]),
  address: z.string().min(8),
  signature: z.string().min(8),
  displayName: z.string().min(1).max(64).optional(),
});

export async function POST(req: NextRequest) {
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

  const user = await upsertUserFromWallet({
    chain,
    address,
    displayName: body.data.displayName,
  });

  const login = await completeLoginOrChallenge(user.id);
  if (login.requires2fa) {
    return NextResponse.json({
      ok: true,
      requires2fa: true,
      pendingToken: login.pendingToken,
      displayName: login.displayName,
    });
  }

  const sessionUser = await getSessionUser();
  return NextResponse.json({
    ok: true,
    requires2fa: false,
    user: {
      id: user.id,
      displayName: user.displayName,
      wallets: user.wallets,
      curatorScore: user.curatorScore,
      totpEnabled: sessionUser?.totpEnabled ?? false,
    },
  });
}
