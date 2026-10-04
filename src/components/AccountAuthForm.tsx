"use client";

import Link from "next/link";
import { useState } from "react";
import { TwoFactorChallenge } from "./TwoFactorChallenge";

const ERRORS: Record<string, string> = {
  invalid_body: "Check the form and try again.",
  invalid_credentials: "Email or password is incorrect.",
  email_taken: "That email is already registered. Sign in instead.",
  invalid_password: "Password must be 8–128 characters.",
  invalid_display_name: "Display name must be 1–64 characters.",
  google_not_configured: "Google sign-in is not configured on this server.",
  google_denied: "Google sign-in was cancelled.",
  google_invalid: "Google sign-in expired. Try again.",
  google_failed: "Google sign-in failed. Try again.",
  google_already_linked: "That Google account is already linked to another profile.",
  auth_unavailable:
    "Sign-in is temporarily unavailable (database busy). Wait a moment and try again.",
};

export function AccountAuthForm({
  mode,
  nextPath,
  googleEnabled,
  initialError,
  initialChallenge,
  initialName,
}: {
  mode: "sign-in" | "sign-up";
  nextPath: string;
  googleEnabled: boolean;
  initialError?: string | null;
  initialChallenge?: string | null;
  initialName?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? (ERRORS[initialError] ?? initialError) : null,
  );
  const [challenge, setChallenge] = useState<{
    pendingToken: string;
    displayName: string;
  } | null>(
    initialChallenge
      ? { pendingToken: initialChallenge, displayName: initialName ?? "account" }
      : null,
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const endpoint = mode === "sign-up" ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: fd.get("displayName"),
          email: fd.get("email"),
          password: fd.get("password"),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        requires2fa?: boolean;
        pendingToken?: string;
        displayName?: string;
      };
      if (!res.ok) {
        throw new Error(ERRORS[data.error ?? ""] ?? data.error ?? "auth_failed");
      }
      if (data.requires2fa && data.pendingToken) {
        setChallenge({
          pendingToken: data.pendingToken,
          displayName: data.displayName ?? "account",
        });
        return;
      }
      window.location.assign(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "auth_failed");
    } finally {
      setBusy(false);
    }
  }

  const googleHref = `/api/auth/google?next=${encodeURIComponent(nextPath)}`;

  return (
    <>
      {challenge ? (
        <TwoFactorChallenge
          pendingToken={challenge.pendingToken}
          displayName={challenge.displayName}
          onCancel={() => setChallenge(null)}
          onSuccess={() => {
            setChallenge(null);
            window.location.assign(nextPath);
          }}
        />
      ) : null}
      <div className="fm-form-stack auth-shell">
        {googleEnabled ? (
          <a href={googleHref} className="fm-btn fm-btn--primary auth-shell__google">
            Continue with Google
          </a>
        ) : (
          <p className="fm-form-note">
            Google sign-in is available once <code>GOOGLE_CLIENT_ID</code> and{" "}
            <code>GOOGLE_CLIENT_SECRET</code> are set.
          </p>
        )}

        <p className="fm-form-divider">or use email</p>

        <form onSubmit={(e) => void onSubmit(e)} className="fm-form-stack">
          {mode === "sign-up" ? (
            <label>
              Display name
              <input
                name="displayName"
                required
                maxLength={64}
                autoComplete="nickname"
                className="fm-field"
              />
            </label>
          ) : null}
          <label>
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="fm-field"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={mode === "sign-up" ? 8 : 1}
              maxLength={128}
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              className="fm-field"
            />
          </label>
          <div className="fm-form-actions">
            <button type="submit" disabled={busy} className="fm-btn fm-btn--primary">
              {busy
                ? "Working…"
                : mode === "sign-up"
                  ? "Create profile"
                  : "Sign in"}
            </button>
          </div>
        </form>
        {error ? <p className="fm-form-error">{error}</p> : null}
        <p className="fm-form-note">
          {mode === "sign-up" ? (
            <>
              Already have a profile?{" "}
              <Link href={`/sign-in?next=${encodeURIComponent(nextPath)}`}>Sign in</Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link href={`/sign-up?next=${encodeURIComponent(nextPath)}`}>
                Create a profile
              </Link>
            </>
          )}
        </p>
      </div>
    </>
  );
}
