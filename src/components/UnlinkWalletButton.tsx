"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WALLET_AUTH_ERRORS } from "@/lib/auth/browser-wallets";

function walletErrorMessage(error: string): string {
  return WALLET_AUTH_ERRORS[error] ?? error;
}

export function UnlinkWalletButton({
  chain,
  address,
  label,
}: {
  chain: string;
  address: string;
  /** Short label for confirm copy, e.g. network or chain. */
  label?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlink() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/unlink-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain, address }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "unlink_failed");
      setConfirming(false);
      router.refresh();
    } catch (e) {
      setError(
        walletErrorMessage(e instanceof Error ? e.message : "unlink_failed"),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <div style={{ display: "grid", gap: "0.25rem" }}>
        <button
          type="button"
          className="fm-btn fm-btn--ghost"
          disabled={busy}
          data-testid="unlink-wallet"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          style={{
            color: "var(--danger)",
            borderColor: "color-mix(in srgb, var(--danger) 45%, transparent)",
            fontSize: "0.82rem",
            padding: "0.3rem 0.65rem",
          }}
        >
          Unlink
        </button>
        {error ? (
          <p style={{ color: "var(--danger)", margin: 0, fontSize: "0.82rem" }}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      style={{ display: "grid", gap: "0.4rem", maxWidth: "40ch" }}
      data-testid="unlink-wallet-confirm"
    >
      <p
        style={{
          margin: 0,
          fontSize: "0.82rem",
          color: "var(--ink-muted)",
          fontFamily: "inherit",
          whiteSpace: "normal",
        }}
      >
        Unlink this {label ?? chain} wallet? On-chain history and listings stay;
        only the account link is removed.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
        <button
          type="button"
          className="fm-btn fm-btn--primary"
          disabled={busy}
          onClick={() => void unlink()}
          style={{
            background: "var(--danger)",
            borderColor: "var(--danger)",
            fontSize: "0.82rem",
            padding: "0.3rem 0.65rem",
          }}
        >
          {busy ? "Unlinking…" : "Confirm unlink"}
        </button>
        <button
          type="button"
          className="fm-btn fm-btn--ghost"
          disabled={busy}
          onClick={() => setConfirming(false)}
          style={{ fontSize: "0.82rem", padding: "0.3rem 0.65rem" }}
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p style={{ color: "var(--danger)", margin: 0, fontSize: "0.82rem" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
