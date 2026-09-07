"use client";

import type { Chain, NetworkId } from "@/lib/discovery/types";
import {
  maybeSendWalletTx,
  requestBuyerAddress,
  sendEvmWalletTx,
  type EvmWalletTx,
} from "@/lib/onchain/wallet-client";
import { TxExplorerLink } from "@/components/TxExplorerLink";
import { useRouter } from "next/navigation";
import { useState } from "react";

function vmForNetwork(network: string): Chain {
  if (network === "solana") return "solana";
  if (network === "boing") return "boing";
  return "evm";
}

export function ResumeCryptoPurchaseButton({
  purchaseId,
  chain,
  network,
  status,
}: {
  purchaseId: string;
  chain: Chain;
  network?: NetworkId | string | null;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [doneHash, setDoneHash] = useState<string | null>(null);

  if (status === "completed" || doneHash) {
    return (
      <span className="badge emerging">
        Owned on buy
        {doneHash ? (
          <>
            {" · "}
            <TxExplorerLink hash={doneHash} chain={chain} network={network} />
          </>
        ) : null}
      </span>
    );
  }

  async function onResume() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      let paymentAddress: string | undefined;
      if (status === "pending_payment") {
        const resumePeek = await fetch("/api/purchase/resume", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchaseId }),
        });
        const peek = await resumePeek.json();
        if (!resumePeek.ok) throw new Error(peek.error || "resume_failed");
        const payNet = String(peek.payNetwork || network || "ethereum");
        const addr = await requestBuyerAddress(vmForNetwork(payNet));
        if (!addr) throw new Error("Connect your payment wallet to continue");
        paymentAddress = addr;
      }

      const resumeRes = await fetch("/api/purchase/resume", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseId,
          buyerPaymentAddress: paymentAddress,
        }),
      });
      const data = await resumeRes.json();
      if (!resumeRes.ok) throw new Error(data.error || "resume_failed");

      if (data.status === "completed") {
        setMsg("Already complete");
        router.refresh();
        return;
      }

      let paymentHash: string | null = null;
      let bridgeRequestId =
        data.bridge && typeof data.bridge === "object"
          ? String(data.bridge.requestId ?? "")
          : "";

      if (data.status === "pending_payment") {
        if (data.bridge) {
          setMsg("Confirm bridge in your wallet…");
          const prep = await fetch("/api/bridge/prepare", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fromNetwork: data.payNetwork,
              toNetwork: data.network,
              amount: data.bridge.amount,
              userAddress: paymentAddress,
              recipientAddress: data.settlementAddress,
            }),
          });
          const prepData = await prep.json();
          if (!prep.ok) throw new Error(prepData.error || "bridge_failed");
          bridgeRequestId =
            prepData.requestId ?? prepData.quote?.requestId ?? bridgeRequestId;
          const hashes: string[] = [];
          for (const step of prepData.walletSteps ?? []) {
            if (step.chain === "evm" && step.to && step.data) {
              hashes.push(
                await sendEvmWalletTx({
                  chain: "evm",
                  chainId: step.chainId,
                  to: step.to,
                  data: step.data,
                  value: step.value ?? "0x0",
                  from: paymentAddress,
                }),
              );
            }
          }
          paymentHash = hashes[0] ?? `bridge:${bridgeRequestId || Date.now()}`;
          await fetch("/api/bridge/confirm", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId: bridgeRequestId || undefined,
              txHashes: hashes,
            }),
          });
        } else if (data.paymentWalletTx) {
          setMsg("Confirm payment in your wallet…");
          paymentHash = await maybeSendWalletTx({
            walletTx: data.paymentWalletTx,
            listingId: data.listingId,
            action: "buy",
            amountUsd: data.amountUsd,
          });
          if (!paymentHash) throw new Error("Confirm the payment in your wallet");
        } else {
          throw new Error("Could not rebuild payment — open the listing to buy again");
        }

        const paid = await fetch("/api/purchase/confirm", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purchaseId,
            step: "payment",
            txHash: paymentHash,
            bridgeRequestId: bridgeRequestId || undefined,
          }),
        });
        const paidData = await paid.json();
        if (!paid.ok) throw new Error(paidData.error || "payment_confirm_failed");
        data.transferWalletTx = paidData.transferWalletTx;
        data.status = "pending_transfer";
      }

      if (data.status === "pending_transfer") {
        setMsg("Confirm NFT transfer in your wallet…");
        let transferTx = data.transferWalletTx;
        if (!transferTx) {
          const again = await fetch("/api/purchase/resume", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ purchaseId }),
          });
          const againData = await again.json();
          if (!again.ok) throw new Error(againData.error || "resume_failed");
          transferTx = againData.transferWalletTx;
        }
        if (!transferTx) throw new Error("Transfer intent unavailable");

        const wt = transferTx as EvmWalletTx & { chain: string };
        let transferHash: string | null = null;
        if (wt.chain === "evm") {
          transferHash = await sendEvmWalletTx(wt);
        } else {
          transferHash = await maybeSendWalletTx({
            walletTx: transferTx,
            listingId: data.listingId,
            action: "buy",
          });
        }
        if (!transferHash) {
          throw new Error("Confirm the NFT transfer in your wallet");
        }

        const done = await fetch("/api/purchase/confirm", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purchaseId,
            step: "transfer",
            txHash: transferHash,
          }),
        });
        const doneData = await done.json();
        if (!done.ok) throw new Error(doneData.error || "transfer_confirm_failed");
        setDoneHash(transferHash);
        setMsg(null);
      }

      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "resume_failed");
    } finally {
      setBusy(false);
    }
  }

  const label =
    status === "pending_payment"
      ? "Finish payment"
      : status === "pending_transfer"
        ? "Finish transfer"
        : "Resume purchase";

  return (
    <span style={{ display: "inline-flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
      <button
        type="button"
        className="badge featured"
        disabled={busy}
        style={{ cursor: busy ? "wait" : "pointer", background: "transparent" }}
        onClick={() => void onResume()}
      >
        {busy ? "Resuming…" : label}
      </button>
      {msg ? (
        <span style={{ color: "var(--ink-muted)", fontSize: "0.8rem" }}>{msg}</span>
      ) : null}
    </span>
  );
}
