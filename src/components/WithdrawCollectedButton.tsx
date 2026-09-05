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
}: {
  purchaseId: string;
  chain: Chain;
  withdrawn?: boolean;
  withdrawTxHash?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (withdrawn) {
    return (
      <span className="badge emerging">
        In wallet
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
          note = "Mint intent recorded — sign in your wallet when ready";
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
      >
        {busy ? "Withdrawing…" : "Withdraw to wallet"}
      </button>
      {msg ? (
        <span style={{ color: "var(--ink-muted)", fontSize: "0.8rem" }}>{msg}</span>
      ) : null}
    </span>
  );
}
