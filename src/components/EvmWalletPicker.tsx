"use client";

import type { DiscoveredEvmWallet } from "@/lib/auth/browser-wallets";

export function EvmWalletPicker({
  wallets,
  onSelect,
  onCancel,
}: {
  wallets: DiscoveredEvmWallet[];
  onSelect: (wallet: DiscoveredEvmWallet) => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Choose EVM wallet"
      style={{
        border: "1px solid var(--line)",
        background: "var(--panel)",
        padding: "0.85rem 1rem",
        display: "grid",
        gap: "0.5rem",
        maxWidth: "22rem",
      }}
    >
      <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>
        Several EVM wallets are installed. Pick the one you want to link.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
        {wallets.map((wallet) => (
          <button
            key={wallet.id}
            type="button"
            className="badge featured"
            onClick={() => onSelect(wallet)}
            style={{ cursor: "pointer", background: "transparent" }}
          >
            {wallet.name}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="badge"
        onClick={onCancel}
        style={{ cursor: "pointer", background: "transparent", justifySelf: "start" }}
      >
        Cancel
      </button>
    </div>
  );
}
