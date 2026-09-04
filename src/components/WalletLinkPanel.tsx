"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signWallet, type BrowserWalletChain } from "@/lib/auth/browser-wallets";

const CHAINS: { id: BrowserWalletChain; label: string; className: string }[] = [
  { id: "evm", label: "Link EVM", className: "badge" },
  { id: "solana", label: "Link Solana", className: "badge emerging" },
  { id: "boing", label: "Link Boing", className: "badge" },
];

export function WalletLinkPanel({
  linkedChains,
}: {
  linkedChains: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<BrowserWalletChain | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function link(chain: BrowserWalletChain) {
    setBusy(chain);
    setError(null);
    setOk(null);
    try {
      const proof = await signWallet(chain);
      const res = await fetch("/api/auth/link-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proof),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "link_failed");
      setOk(`${chain} wallet linked`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "link_failed");
    } finally {
      setBusy(null);
    }
  }

  const remaining = CHAINS.filter((c) => !linkedChains.includes(c.id));

  return (
    <div style={{ display: "grid", gap: "0.65rem" }}>
      {remaining.length === 0 ? (
        <p style={{ color: "var(--ink-muted)", margin: 0 }}>
          EVM, Solana, and Boing are linked. Sign a message from another address
          to add it — one wallet address can only belong to one profile.
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {remaining.map((chain) => (
            <button
              key={chain.id}
              type="button"
              className={chain.className}
              disabled={busy !== null}
              onClick={() => void link(chain.id)}
              style={{ cursor: "pointer", background: "transparent" }}
            >
              {busy === chain.id ? "Signing…" : chain.label}
            </button>
          ))}
        </div>
      )}
      {error ? (
        <p style={{ color: "var(--danger)", margin: 0, fontSize: "0.9rem" }}>{error}</p>
      ) : null}
      {ok ? (
        <p style={{ color: "var(--emergent)", margin: 0, fontSize: "0.9rem" }}>{ok}</p>
      ) : null}
    </div>
  );
}
