"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { signWallet, type BrowserWalletChain } from "@/lib/auth/browser-wallets";
import { TwoFactorChallenge } from "./TwoFactorChallenge";

type SessionUser = {
  id: string;
  displayName: string;
  curatorScore: number;
  wallets: { chain: string; address: string }[];
  emerging?: boolean;
  role?: string;
  totpEnabled?: boolean;
};

const DEMO_PERSONAS = [
  { id: "artist-fresh", label: "Fresh Paper (emerging)" },
  { id: "artist-nova", label: "Nova Ink" },
  { id: "collector-mira", label: "Mira Collects" },
  { id: "collector-kai", label: "Kai Collects" },
  { id: "curator-guest", label: "Guest Atelier (editor)" },
  { id: "mod-ops", label: "Ops Moderator" },
];

export function WalletBar() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<{
    pendingToken: string;
    displayName: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/auth/me");
    const data = await res.json();
    setUser(data.user);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function handleAuthResponse(data: {
    requires2fa?: boolean;
    pendingToken?: string;
    displayName?: string;
    user?: SessionUser;
  }) {
    if (data.requires2fa && data.pendingToken) {
      setChallenge({
        pendingToken: data.pendingToken,
        displayName: data.displayName ?? "account",
      });
      return;
    }
    if (data.user) setUser(data.user);
  }

  async function demoLogin(userId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "login_failed");
      handleAuthResponse(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "login_failed");
    } finally {
      setBusy(false);
    }
  }

  async function connectOrLink(chain: BrowserWalletChain) {
    setBusy(true);
    setError(null);
    try {
      const proof = await signWallet(chain);
      const endpoint = user ? "/api/auth/link-wallet" : "/api/auth/verify";
      const verifyRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proof),
      });
      const data = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(data.error ?? "verify_failed");
      if (endpoint === "/api/auth/verify") {
        handleAuthResponse(data);
      } else {
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "connect_failed");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.dispatchEvent(new Event("fm-auth-changed"));
  }

  return (
    <>
      {challenge ? (
        <TwoFactorChallenge
          pendingToken={challenge.pendingToken}
          displayName={challenge.displayName}
          onCancel={() => setChallenge(null)}
          onSuccess={(u) => {
            setChallenge(null);
            setUser(u as SessionUser);
            void refresh();
          }}
        />
      ) : null}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.6rem",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        {user ? (
          <>
            <Link
              href="/me"
              style={{ color: "var(--ink-muted)", fontSize: "0.9rem" }}
            >
              {user.displayName}
              {user.emerging ? " · Emerging" : ""}
              {user.role && user.role !== "member" ? ` · ${user.role}` : ""} ·
              score {user.curatorScore}
              {user.totpEnabled ? " · 2FA" : ""}
            </Link>
            <button
              type="button"
              className="badge"
              onClick={() => void logout()}
              style={{ cursor: "pointer", background: "transparent" }}
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link href="/sign-in" className="badge featured">
              Sign in
            </Link>
            <Link href="/sign-up" className="badge">
              Create profile
            </Link>
            <button
              type="button"
              className="badge featured"
              disabled={busy}
              onClick={() => void connectOrLink("evm")}
              style={{ cursor: "pointer", background: "transparent" }}
            >
              Connect EVM
            </button>
            <button
              type="button"
              className="badge emerging"
              disabled={busy}
              onClick={() => void connectOrLink("solana")}
              style={{ cursor: "pointer", background: "transparent" }}
            >
              Connect Solana
            </button>
            <button
              type="button"
              className="badge"
              disabled={busy}
              onClick={() => void connectOrLink("boing")}
              style={{ cursor: "pointer", background: "transparent" }}
            >
              Connect Boing
            </button>
            <select
              disabled={busy}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) void demoLogin(e.target.value);
              }}
              style={{
                background: "var(--panel)",
                border: "1px solid var(--line)",
                color: "var(--ink)",
                padding: "0.3rem 0.5rem",
              }}
            >
              <option value="" disabled>
                Demo persona…
              </option>
              {DEMO_PERSONAS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </>
        )}
        {error ? (
          <span style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
            {error}
          </span>
        ) : null}
      </div>
    </>
  );
}
