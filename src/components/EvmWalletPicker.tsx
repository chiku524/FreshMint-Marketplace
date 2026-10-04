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
      className="fm-form-dialog"
      style={{ position: "relative", boxShadow: "none" }}
    >
      <p className="fm-form-note">
        Several EVM wallets are installed. Pick the one you want to link.
      </p>
      <div className="fm-form-actions">
        {wallets.map((wallet) => (
          <button
            key={wallet.id}
            type="button"
            className="fm-btn fm-btn--primary"
            onClick={() => onSelect(wallet)}
          >
            {wallet.name}
          </button>
        ))}
      </div>
      <div className="fm-form-actions">
        <button type="button" className="fm-btn fm-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
