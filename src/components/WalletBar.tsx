"use client";

import { useCallback, useEffect, useState } from "react";
import bs58 from "bs58";

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

  async function connectSolana() {
    setBusy(true);
    setError(null);
    try {
      const provider = (
        window as unknown as {
          solana?: {
            isPhantom?: boolean;
            connect: () => Promise<{ publicKey: { toBytes: () => Uint8Array; toString: () => string } }>;
            signMessage: (
              msg: Uint8Array,
              display?: string,
            ) => Promise<{ signature: Uint8Array }>;
          };
        }
      ).solana;
      if (!provider) {
        throw new Error("No Phantom wallet found");
      }
      const { publicKey } = await provider.connect();
      const address = publicKey.toString();

      const nonceRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain: "solana", address }),
      });
      const { message } = await nonceRes.json();
      const encoded = new TextEncoder().encode(message);
      const signed = await provider.signMessage(encoded, "utf8");
      const signature = bs58.encode(signed.signature);

      const endpoint = user ? "/api/auth/link-wallet" : "/api/auth/verify";
      const verifyRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain: "solana", address, signature }),
      });
      const data = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(data.error ?? "verify_failed");
      if (data.user) setUser(data.user);
      else await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "solana_connect_failed");
    } finally {
      setBusy(false);
    }
  }

  async function linkEvm() {
    if (!user) return connectEvm();
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
      if (!eth) throw new Error("No EVM wallet");
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
      const res = await fetch("/api/auth/link-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain: "evm", address, signature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "link_failed");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "link_failed");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  const hasEvm = user?.wallets.some((w) => w.chain === "evm");
  const hasSol = user?.wallets.some((w) => w.chain === "solana");

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
          {!hasEvm ? (
            <button
              type="button"
              className="badge"
              disabled={busy}
              onClick={() => void linkEvm()}
              style={{ cursor: "pointer", background: "transparent" }}
            >
              Link EVM
            </button>
          ) : null}
          {!hasSol ? (
            <button
              type="button"
              className="badge emerging"
              disabled={busy}
              onClick={() => void connectSolana()}
              style={{ cursor: "pointer", background: "transparent" }}
            >
              Link Solana
            </button>
          ) : null}
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
            Connect EVM
          </button>
          <button
            type="button"
            className="badge emerging"
            disabled={busy}
            onClick={() => void connectSolana()}
            style={{ cursor: "pointer", background: "transparent" }}
          >
            Connect Solana
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
