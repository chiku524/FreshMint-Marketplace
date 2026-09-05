import { AccountError, loginWithPassword } from "@/lib/auth/account";
import {
  completeLoginOrChallenge,
  getSessionUser,
  jsonWithSessionCookie,
  publicSession,
} from "@/lib/auth/session";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const { userId } = await loginWithPassword(body.data);
    const login = await completeLoginOrChallenge(userId);
    if (login.requires2fa) {
      return NextResponse.json({
        ok: true,
        requires2fa: true,
        pendingToken: login.pendingToken,
        displayName: login.displayName,
      });
    }
    const user = await getSessionUser();
    return jsonWithSessionCookie(
      {
        ok: true,
        requires2fa: false,
        user: user ? publicSession(user) : null,
      },
      login,
    );
  } catch (e) {
    if (e instanceof AccountError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "login_failed" }, { status: 500 });
  }
}
