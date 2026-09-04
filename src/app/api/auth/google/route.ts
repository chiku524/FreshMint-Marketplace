import {
  beginGooglePkce,
  createGoogleOAuthState,
  googleAuthorizeUrl,
  isGoogleAuthConfigured,
} from "@/lib/auth/google";
import { safeNextPath } from "@/lib/auth/paths";
import { getSessionUser } from "@/lib/auth/session";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  if (!isGoogleAuthConfigured()) {
    return NextResponse.redirect(
      new URL("/sign-in?error=google_not_configured", req.url),
    );
  }

  const next = safeNextPath(req.nextUrl.searchParams.get("next"));
  const link = req.nextUrl.searchParams.get("intent") === "link";
  const user = link ? await getSessionUser() : null;

  const state = await createGoogleOAuthState({
    next,
    uid: user?.id,
  });
  const codeChallenge = await beginGooglePkce();
  const url = googleAuthorizeUrl({
    state,
    codeChallenge,
    requestUrl: req.url,
  });
  return NextResponse.redirect(url);
}
