"use client";

import { useCallback, useEffect, useState } from "react";

type SessionUser = {
  id: string;
  displayName: string;
  curatorScore: number;
  wallets: { chain: string; address: string }[];
  emerging?: boolean;
  role?: string;
};

const DEMO_PERSONAS = [
  { id: "artist-fresh", label: "Fresh Paper (emerging)" },
  { id: "artist-nova", label: "Nova Ink" },
  { id: "collector-mira", label: "Mira Collects" },
  { id: "curator-guest", label: "Guest Atelier (editor)" },
  { id: "mod-ops", label: "Ops Moderator" },
];

export function WalletBar() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/auth/me");
    const data = await res.json();
    setUser(data.user);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
      setUser(data.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "login_failed");
    } finally {
      setBusy(false);
    }
  }

  async function connectEvm() {
    setBusy(true);
    setError(null);
    try {
      const eth = (
        window as unknown as {
          ethereum?: {
            request: (args: {
              method: string;
              params?: unknown[];
            }) => Promise<unknown>;
          };
        }
      ).ethereum;
      if (!eth) {
        throw new Error("No EVM wallet found — use a demo persona below");
      }
      const accounts = (await eth.request({
        method: "eth_requestAccounts",
      })) as string[];
      const address = accounts[0];
      if (!address) throw new Error("no_account");

      const nonceRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain: "evm", address }),
      });
      const { message } = await nonceRes.json();
      const signature = (await eth.request({
        method: "personal_sign",
        params: [message, address],
      })) as string;

      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain: "evm", address, signature }),
      });
      const data = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(data.error ?? "verify_failed");
      setUser(data.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "connect_failed");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  return (
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
          <span style={{ color: "var(--ink-muted)", fontSize: "0.9rem" }}>
            {user.displayName}
            {user.emerging ? " · Emerging" : ""}
            {user.role && user.role !== "member" ? ` · ${user.role}` : ""} ·
            score {user.curatorScore}
          </span>
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
          <button
            type="button"
            className="badge featured"
            disabled={busy}
            onClick={() => void connectEvm()}
            style={{ cursor: "pointer", background: "transparent" }}
          >
            Connect EVM wallet
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
        <span style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</span>
      ) : null}
    </div>
  );
}
