"use client";

import { TxExplorerLink } from "@/components/TxExplorerLink";
import type { NetworkId } from "@/lib/discovery/types";
import {
  browserWalletAvailable,
  requestBuyerAddress,
  sendEvmWalletTx,
  type EvmWalletTx,
} from "@/lib/onchain/wallet-client";
import { useState } from "react";

function shortAddr(addr: string) {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function UpdateFeeRecipientsButton({
  collectionId,
  network,
  contractAddress,
}: {
  collectionId: string;
  network: NetworkId | string;
  contractAddress: string;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const treasuryHint =
    process.env.NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS?.trim() || null;
  const operatorHint =
    process.env.NEXT_PUBLIC_PLATFORM_OPERATOR_ADDRESS?.trim() || null;

  async function run() {
    setBusy(true);
    setMsg(null);
    setTxHash(null);
    try {
      if (!browserWalletAvailable("evm")) {
        setMsg("Connect MetaMask / Rabby with the collection owner wallet");
        return;
      }

      const fromAddress = await requestBuyerAddress("evm");
      if (!fromAddress) {
        setMsg("Wallet address required");
        return;
      }

      const prepRes = await fetch(
        `/api/collections/${collectionId}/set-fee-recipients`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromAddress }),
        },
      );
      const prep = await prepRes.json();
      if (!prepRes.ok) {
        if (prep.error === "not_onchain_owner") {
          const connected =
            typeof prep.connected === "string" ? shortAddr(prep.connected) : shortAddr(fromAddress);
          const onchain =
            typeof prep.onchainOwner === "string"
              ? shortAddr(prep.onchainOwner)
              : "unknown";
          setMsg(
            `Connected wallet ${connected} is not the on-chain collection owner (${onchain})`,
          );
          return;
        }
        setMsg(
          prep.error === "forbidden"
            ? "Only the collection owner can update fee recipients"
            : prep.error === "unauthorized"
              ? "Sign in to update fee recipients"
              : prep.error === "wallet_required"
                ? "Connect the on-chain collection owner wallet"
                : prep.error === "collection_not_deployed"
                  ? "Deploy the collection contract first"
                  : prep.error === "evm_only"
                    ? "Fee recipient updates are EVM-only"
                    : prep.error === "invalid_contract"
                      ? "Collection contract address is invalid"
                      : prep.error === "owner_read_failed"
                        ? "Could not read on-chain collection owner"
                        : prep.error || "prepare_failed",
        );
        return;
      }

      const wt = prep.walletTx as EvmWalletTx & { chain?: string };
      if (!wt?.data) {
        setMsg("No wallet transaction returned");
        return;
      }

      const hash = await sendEvmWalletTx(wt);
      setTxHash(hash);
      const treasury =
        typeof prep.feeRecipients?.treasury === "string"
          ? prep.feeRecipients.treasury
          : treasuryHint;
      const operator =
        typeof prep.feeRecipients?.operator === "string"
          ? prep.feeRecipients.operator
          : operatorHint;
      setMsg(
        `Fee recipients updated on-chain` +
          (treasury ? ` · treasury ${shortAddr(treasury)}` : "") +
          (operator ? ` · operator ${shortAddr(operator)}` : ""),
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "update_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        marginTop: "1.25rem",
        padding: "0.85rem 1rem",
        border: "1px solid var(--line)",
        borderRadius: "0.5rem",
        maxWidth: "40rem",
      }}
    >
      <h2 className="display" style={{ fontSize: "1.15rem", margin: "0 0 0.4rem" }}>
        Platform fee recipients
      </h2>
      <p
        style={{
          margin: "0 0 0.65rem",
          fontSize: "0.82rem",
          color: "var(--ink-muted)",
          lineHeight: 1.45,
        }}
      >
        Updates this collection&apos;s on-chain fee payout addresses to FreshMint&apos;s
        current treasury and operator. Uses{" "}
        <code>setFeeRecipients</code> only — it does{" "}
        <strong>not</strong> change the fee rate (BPS). Older contracts keep whatever
        BPS was baked in at deploy; new contracts use 0.5% treasury / 0% operator.
        Sign with the wallet that deployed the contract (
        <code title={contractAddress}>{shortAddr(contractAddress)}</code>
        ).
      </p>

      <button
        type="button"
        className="badge emerging"
        disabled={busy}
        style={{
          cursor: busy ? "wait" : "pointer",
          background: "transparent",
        }}
        onClick={() => void run()}
      >
        {busy ? "Confirm in wallet…" : "Update fee recipients"}
      </button>

      {treasuryHint || operatorHint ? (
        <p
          style={{
            margin: "0.45rem 0 0",
            fontSize: "0.72rem",
            color: "var(--ink-muted)",
            lineHeight: 1.4,
            wordBreak: "break-all",
          }}
        >
          {treasuryHint ? (
            <>
              Target treasury: <code>{treasuryHint}</code>
            </>
          ) : null}
          {treasuryHint && operatorHint ? <br /> : null}
          {operatorHint ? (
            <>
              Target operator: <code>{operatorHint}</code>
            </>
          ) : null}
        </p>
      ) : (
        <p
          style={{
            margin: "0.45rem 0 0",
            fontSize: "0.72rem",
            color: "var(--ink-muted)",
          }}
        >
          Set NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS / OPERATOR_ADDRESS so the
          intent can target live recipients.
        </p>
      )}

      {msg ? (
        <p
          style={{
            margin: "0.45rem 0 0",
            fontSize: "0.8rem",
            color: "var(--emergent)",
          }}
        >
          {msg}
          {txHash ? (
            <>
              {" · "}
              <TxExplorerLink hash={txHash} chain="evm" network={network} />
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
