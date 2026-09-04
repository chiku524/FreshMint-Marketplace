import {
  AccountError,
  linkGoogleToUser,
  upsertUserFromGoogle,
} from "@/lib/auth/account";
import {
  exchangeGoogleCode,
  GOOGLE_PKCE_COOKIE,
  googlePkceCookieOptions,
  readGoogleOAuthState,
  readGooglePkce,
} from "@/lib/auth/google";
import { absoluteAppUrl, safeNextPath } from "@/lib/auth/paths";
import { applySessionCookie, completeLoginOrChallenge } from "@/lib/auth/session";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function fail(req: NextRequest, error: string) {
  return NextResponse.redirect(
    absoluteAppUrl(`/sign-in?error=${error}`, req.url),
  );
}

function clearPkce(res: NextResponse) {
  res.cookies.set(GOOGLE_PKCE_COOKIE, "", googlePkceCookieOptions(0));
  return res;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const stateToken = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError) return fail(req, "google_denied");
  if (!code || !stateToken) return fail(req, "google_invalid");

  const state = await readGoogleOAuthState(stateToken);
  if (!state) return fail(req, "google_invalid");

  const verifier = await readGooglePkce();
  if (!verifier) return fail(req, "google_invalid");

  try {
    const profile = await exchangeGoogleCode({
      code,
      verifier,
      requestUrl: req.url,
    });

    if (state.uid) {
      await linkGoogleToUser({ userId: state.uid, profile });
      return clearPkce(
        NextResponse.redirect(absoluteAppUrl(safeNextPath(state.next), req.url)),
      );
    }

    const { userId } = await upsertUserFromGoogle(profile);
    const login = await completeLoginOrChallenge(userId);
    if (login.requires2fa) {
      const dest = absoluteAppUrl("/sign-in", req.url);
      dest.searchParams.set("challenge", login.pendingToken);
      dest.searchParams.set("name", login.displayName);
      dest.searchParams.set("next", safeNextPath(state.next));
      return clearPkce(NextResponse.redirect(dest));
    }

    const res = NextResponse.redirect(
      absoluteAppUrl(safeNextPath(state.next), req.url),
    );
    applySessionCookie(res, login.jwt, login.expiresAt);
    return clearPkce(res);
  } catch (e) {
    if (e instanceof AccountError) return fail(req, e.message);
    console.error("[auth/google/callback]", e);
    return fail(req, "google_failed");
  }
}
