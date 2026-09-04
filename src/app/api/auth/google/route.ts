import {
  createGoogleOAuthState,
  createGooglePkce,
  GOOGLE_PKCE_COOKIE,
  googleAuthorizeUrl,
  googlePkceCookieOptions,
  isGoogleAuthConfigured,
} from "@/lib/auth/google";
import { absoluteAppUrl, safeNextPath } from "@/lib/auth/paths";
import { getSessionUser } from "@/lib/auth/session";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isGoogleAuthConfigured()) {
    return NextResponse.redirect(
      absoluteAppUrl("/sign-in?error=google_not_configured", req.url),
    );
  }

  const next = safeNextPath(req.nextUrl.searchParams.get("next"));
  const link = req.nextUrl.searchParams.get("intent") === "link";
  const user = link ? await getSessionUser() : null;

  const state = await createGoogleOAuthState({
    next,
    uid: user?.id,
  });
  const { verifier, challenge } = createGooglePkce();
  const url = googleAuthorizeUrl({
    state,
    codeChallenge: challenge,
    requestUrl: req.url,
  });
  const res = NextResponse.redirect(url);
  res.cookies.set(GOOGLE_PKCE_COOKIE, verifier, googlePkceCookieOptions());
  return res;
}
