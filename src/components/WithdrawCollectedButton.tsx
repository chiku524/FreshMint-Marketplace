"use client";

import type { Chain } from "@/lib/discovery/types";
import { maybeSendWalletTx } from "@/lib/onchain/wallet-client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function WithdrawCollectedButton({
  purchaseId,
  chain,
  withdrawn = false,
  withdrawTxHash = null,
  cryptoOwned = false,
}: {
  purchaseId: string;
  chain: Chain;
  withdrawn?: boolean;
  withdrawTxHash?: string | null;
  /** Crypto primary buy — ownership already delivered at purchase. */
  cryptoOwned?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (withdrawn || cryptoOwned) {
    return (
      <span className="badge emerging">
        {cryptoOwned && !withdrawn ? "Owned on buy" : "In wallet"}
        {withdrawTxHash ? ` · ${withdrawTxHash.slice(0, 10)}…` : ""}
      </span>
    );
  }

  async function onWithdraw() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/withdraw", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error === "wallet_required"
            ? `Link a ${chain} wallet in Settings first`
            : data.error === "already_withdrawn"
              ? "Already withdrawn"
              : data.error === "crypto_purchase_owned_at_buy"
                ? "Already owned on-chain from purchase"
                : data.error || "withdraw_failed",
        );
      }
      let note = "Withdraw prepared";
      if (data.walletTx) {
        const hash = await maybeSendWalletTx({
          walletTx: data.walletTx,
          listingId: data.listingId,
          action: "mint",
          amountUsd: undefined,
        });
        if (hash) {
          await fetch("/api/onchain/confirm", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              listingId: data.listingId,
              action: "mint",
              txHash: hash,
            }),
          });
          note = `Withdrawn · ${hash.slice(0, 12)}…`;
        } else {
          note = "Confirm the transfer in your wallet when ready";
        }
      } else if (data.txHash) {
        note = `Withdrawn · ${String(data.txHash).slice(0, 12)}…`;
      }
      setMsg(note);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "withdraw_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
      <button
        type="button"
        className="badge emerging"
        disabled={busy}
        style={{ cursor: busy ? "wait" : "pointer", background: "transparent" }}
        onClick={() => void onWithdraw()}
        title="For legacy USD purchases that still need an on-chain transfer"
      >
        {busy ? "Withdrawing…" : "Withdraw (legacy)"}
      </button>
      {msg ? (
        <span style={{ color: "var(--ink-muted)", fontSize: "0.8rem" }}>{msg}</span>
      ) : null}
    </span>
  );
}
