import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { appBaseUrl } from "@/lib/auth/paths";

const PKCE_COOKIE = "freshmint_google_pkce";

export type GoogleProfile = {
  id: string;
  email: string;
  verified_email: boolean;
  name?: string;
  picture?: string;
};

export type GoogleOAuthState = {
  next: string;
  uid?: string;
};

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET must be set (min 16 chars)");
  }
  return new TextEncoder().encode(secret);
}

export function isGoogleAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
}

export function googleCallbackUrl(requestUrl?: string): string {
  return `${appBaseUrl(requestUrl)}/api/auth/google/callback`;
}

export async function createGoogleOAuthState(
  input: GoogleOAuthState,
): Promise<string> {
  return new SignJWT({
    purpose: "google_oauth",
    next: input.next,
    uid: input.uid ?? "",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .setIssuedAt()
    .sign(authSecret());
}

export async function readGoogleOAuthState(
  token: string,
): Promise<GoogleOAuthState | null> {
  try {
    const { payload } = await jwtVerify(token, authSecret());
    if (payload.purpose !== "google_oauth") return null;
    const next = String(payload.next ?? "/me");
    const uid = String(payload.uid ?? "");
    return { next, uid: uid || undefined };
  } catch {
    return null;
  }
}

export const GOOGLE_PKCE_COOKIE = PKCE_COOKIE;

export function googlePkceCookieOptions(maxAge = 10 * 60) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function createGooglePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function readGooglePkce(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(PKCE_COOKIE)?.value ?? null;
}

export function googleAuthorizeUrl(input: {
  state: string;
  codeChallenge: string;
  requestUrl?: string;
}): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: googleCallbackUrl(input.requestUrl),
    response_type: "code",
    scope: "openid email profile",
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(input: {
  code: string;
  verifier: string;
  requestUrl?: string;
}): Promise<GoogleProfile> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: googleCallbackUrl(input.requestUrl),
      grant_type: "authorization_code",
      code_verifier: input.verifier,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error("google_token_failed");
  }
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) throw new Error("google_token_missing");

  const profileRes = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    { headers: { Authorization: `Bearer ${tokens.access_token}` } },
  );
  if (!profileRes.ok) throw new Error("google_profile_failed");
  const profile = (await profileRes.json()) as GoogleProfile;
  if (!profile.id || !profile.email) throw new Error("google_profile_incomplete");
  return profile;
}
