"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EvmWalletPicker } from "@/components/EvmWalletPicker";
import {
  discoverEvmWallets,
  signWallet,
  WALLET_AUTH_ERRORS,
  type BrowserWalletChain,
  type DiscoveredEvmWallet,
  type EthProvider,
} from "@/lib/auth/browser-wallets";

const CHAINS: { id: BrowserWalletChain; label: string; className: string }[] = [
  { id: "evm", label: "Link EVM", className: "badge" },
  { id: "solana", label: "Link Solana", className: "badge emerging" },
  { id: "boing", label: "Link Boing", className: "badge" },
];

function walletErrorMessage(error: string): string {
  return WALLET_AUTH_ERRORS[error] ?? error;
}

export function WalletLinkPanel() {
  const router = useRouter();
  const [busy, setBusy] = useState<BrowserWalletChain | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [evmChoices, setEvmChoices] = useState<DiscoveredEvmWallet[] | null>(
    null,
  );

  async function submit(chain: BrowserWalletChain, evmProvider?: EthProvider) {
    setBusy(chain);
    setError(null);
    setOk(null);
    try {
      const proof = await signWallet(chain, evmProvider);
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
      setError(
        walletErrorMessage(e instanceof Error ? e.message : "link_failed"),
      );
    } finally {
      setBusy(null);
      setEvmChoices(null);
    }
  }

  async function link(chain: BrowserWalletChain) {
    setError(null);
    setOk(null);
    if (chain !== "evm") {
      await submit(chain);
      return;
    }
    const wallets = await discoverEvmWallets();
    if (wallets.length === 0) {
      setError("No EVM wallet found");
      return;
    }
    if (wallets.length === 1) {
      await submit("evm", wallets[0].provider);
      return;
    }
    setEvmChoices(wallets);
  }

  return (
    <div style={{ display: "grid", gap: "0.65rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {CHAINS.map((chain) => (
          <button
            key={chain.id}
            type="button"
            className={chain.className}
            disabled={busy !== null || evmChoices !== null}
            onClick={() => void link(chain.id)}
            style={{ cursor: "pointer", background: "transparent" }}
          >
            {busy === chain.id ? "Signing…" : chain.label}
          </button>
        ))}
      </div>
      {evmChoices ? (
        <EvmWalletPicker
          wallets={evmChoices}
          onSelect={(wallet) => void submit("evm", wallet.provider)}
          onCancel={() => setEvmChoices(null)}
        />
      ) : null}
      {error ? (
        <p style={{ color: "var(--danger)", margin: 0, fontSize: "0.9rem" }}>
          {error}
        </p>
      ) : null}
      {ok ? (
        <p style={{ color: "var(--emergent)", margin: 0, fontSize: "0.9rem" }}>
          {ok}
        </p>
      ) : null}
    </div>
  );
}
