import {
  AccountError,
  linkGoogleToUser,
  upsertUserFromGoogle,
} from "@/lib/auth/account";
import {
  consumeGooglePkce,
  exchangeGoogleCode,
  readGoogleOAuthState,
} from "@/lib/auth/google";
import { safeNextPath } from "@/lib/auth/paths";
import { completeLoginOrChallenge } from "@/lib/auth/session";
import { NextRequest, NextResponse } from "next/server";

function fail(req: NextRequest, error: string) {
  return NextResponse.redirect(new URL(`/sign-in?error=${error}`, req.url));
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const stateToken = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError) return fail(req, "google_denied");
  if (!code || !stateToken) return fail(req, "google_invalid");

  const state = await readGoogleOAuthState(stateToken);
  if (!state) return fail(req, "google_invalid");

  const verifier = await consumeGooglePkce();
  if (!verifier) return fail(req, "google_invalid");

  try {
    const profile = await exchangeGoogleCode({
      code,
      verifier,
      requestUrl: req.url,
    });

    if (state.uid) {
      await linkGoogleToUser({ userId: state.uid, profile });
      return NextResponse.redirect(new URL(safeNextPath(state.next), req.url));
    }

    const { userId } = await upsertUserFromGoogle(profile);
    const login = await completeLoginOrChallenge(userId);
    if (login.requires2fa) {
      const dest = new URL("/sign-in", req.url);
      dest.searchParams.set("challenge", login.pendingToken);
      dest.searchParams.set("name", login.displayName);
      dest.searchParams.set("next", safeNextPath(state.next));
      return NextResponse.redirect(dest);
    }

    return NextResponse.redirect(new URL(safeNextPath(state.next), req.url));
  } catch (e) {
    if (e instanceof AccountError) return fail(req, e.message);
    return fail(req, "google_failed");
  }
}
