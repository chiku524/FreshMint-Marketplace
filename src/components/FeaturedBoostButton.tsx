"use client";

import {
  FEATURED_BOOST_USD,
  describeFeaturedBoost,
} from "@/lib/fees/featured-boost";
import type { Chain, NetworkId } from "@/lib/discovery/types";
import {
  browserWalletAvailable,
  maybeSendWalletTx,
  requestBuyerAddress,
} from "@/lib/onchain/wallet-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const PAY_LABELS: Record<string, string> = {
  ethereum: "Ethereum (ETH)",
  base: "Base (ETH)",
  arbitrum: "Arbitrum (ETH)",
  optimism: "Optimism (ETH)",
  solana: "Solana (SOL)",
  boing: "Boing (BOING)",
};

const DEFAULT_PAY_NETWORKS: NetworkId[] = [
  "ethereum",
  "base",
  "arbitrum",
  "optimism",
  "solana",
];

function vmForNetwork(network: string): Chain {
  if (network === "solana") return "solana";
  if (network === "boing") return "boing";
  return "evm";
}

function shortAddr(addr: string) {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function FeaturedBoostButton({
  listingId,
  alreadyBoosted = false,
  defaultNetwork = "ethereum",
}: {
  listingId: string;
  alreadyBoosted?: boolean;
  /** Listing settlement network — used as the default pay network. */
  defaultNetwork?: NetworkId | string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [payNetwork, setPayNetwork] = useState<string>(() => {
    const n = defaultNetwork || "ethereum";
    return DEFAULT_PAY_NETWORKS.includes(n as NetworkId) ? n : "ethereum";
  });

  const treasuryEvm =
    process.env.NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS?.trim() || null;
  const treasurySol =
    process.env.NEXT_PUBLIC_PLATFORM_TREASURY_SOLANA?.trim() || null;

  const payVm = useMemo(() => vmForNetwork(payNetwork), [payNetwork]);
  const treasuryForPay =
    payVm === "solana" ? treasurySol : treasuryEvm;

  if (alreadyBoosted) {
    return (
      <p
        style={{
          margin: "0.75rem 0 0",
          fontSize: "0.85rem",
          color: "var(--accent-soft)",
        }}
      >
        Featured boost active — shown in the Promoted section on{" "}
        <Link href="/featured">/featured</Link>. Rising scoring is unchanged.
      </p>
    );
  }

  async function boost() {
    setBusy(true);
    setMsg(null);
    try {
      if (!browserWalletAvailable(payVm)) {
        setMsg(
          payVm === "solana"
            ? "Connect Phantom to pay the Featured boost"
            : payVm === "boing"
              ? "Connect Boing Express to pay the Featured boost"
              : "Connect MetaMask / Rabby to pay the Featured boost",
        );
        return;
      }

      const fromAddress = await requestBuyerAddress(payVm);
      if (!fromAddress) {
        setMsg("Wallet address required");
        return;
      }

      const prepRes = await fetch(`/api/listings/${listingId}/boost`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payNetwork, fromAddress }),
      });
      const prep = await prepRes.json();
      if (!prepRes.ok) {
        setMsg(
          prep.error === "publish_first"
            ? "Soft-launch or publish before boosting"
            : prep.error === "already_boosted"
              ? "Already boosted"
              : prep.error === "unauthorized"
                ? "Sign in to request a boost"
                : prep.error === "wallet_required"
                  ? "Connect a wallet to pay"
                  : prep.error || "boost_failed",
        );
        return;
      }

      const paymentHash = await maybeSendWalletTx({
        walletTx: prep.walletTx,
        listingId,
        action: "buy",
        amountUsd: FEATURED_BOOST_USD,
      });
      if (!paymentHash) {
        setMsg("Confirm the $15 treasury payment in your wallet popup");
        return;
      }

      const confRes = await fetch(`/api/listings/${listingId}/boost/confirm`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payNetwork, txHash: paymentHash }),
      });
      const conf = await confRes.json();
      if (!confRes.ok) {
        setMsg(
          conf.error === "invalid_tx" || conf.error === "tx_reverted"
            ? "Payment could not be verified — try again or wait for confirmation"
            : conf.error === "already_boosted"
              ? "Already boosted"
              : conf.error || "boost_confirm_failed",
        );
        return;
      }

      const quoteNote =
        prep.quote && typeof prep.quote.formatted === "string"
          ? ` (${prep.quote.formatted} ${prep.quote.symbol ?? ""})`.trimEnd()
          : "";
      setMsg(
        `Featured boost active · paid $${FEATURED_BOOST_USD}${quoteNote} to treasury · ${shortAddr(String(paymentHash))}`,
      );
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "boost_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: "0.85rem" }}>
      <label
        style={{
          display: "block",
          fontSize: "0.78rem",
          color: "var(--ink-muted)",
          marginBottom: "0.35rem",
        }}
      >
        Pay network
        <select
          value={payNetwork}
          disabled={busy}
          onChange={(e) => setPayNetwork(e.target.value)}
          style={{
            display: "block",
            marginTop: "0.25rem",
            maxWidth: "18rem",
          }}
        >
          {DEFAULT_PAY_NETWORKS.map((id) => (
            <option key={id} value={id}>
              {PAY_LABELS[id] ?? id}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className="badge featured"
        disabled={busy}
        style={{
          cursor: busy ? "wait" : "pointer",
          background: "transparent",
        }}
        onClick={() => void boost()}
        title={describeFeaturedBoost()}
      >
        {busy
          ? "Paying treasury…"
          : `Boost to Featured · $${FEATURED_BOOST_USD}`}
      </button>

      <p
        style={{
          margin: "0.4rem 0 0",
          fontSize: "0.78rem",
          color: "var(--ink-muted)",
          maxWidth: "48ch",
          lineHeight: 1.45,
        }}
      >
        Optional paid promotional placement in Featured only — never Rising.
        You pay ${FEATURED_BOOST_USD} USD in native on the network you choose;
        funds go to the platform treasury
        {treasuryForPay ? (
          <>
            {" "}
            (<code title={treasuryForPay}>{shortAddr(treasuryForPay)}</code>)
          </>
        ) : (
          " (set NEXT_PUBLIC_PLATFORM_TREASURY_* env)"
        )}
        .
      </p>
      {(treasuryEvm || treasurySol) && (
        <p
          style={{
            margin: "0.25rem 0 0",
            fontSize: "0.72rem",
            color: "var(--ink-muted)",
            maxWidth: "52ch",
            lineHeight: 1.4,
            wordBreak: "break-all",
          }}
        >
          {treasuryEvm ? (
            <>
              EVM treasury: <code>{treasuryEvm}</code>
            </>
          ) : null}
          {treasuryEvm && treasurySol ? <br /> : null}
          {treasurySol ? (
            <>
              Solana treasury: <code>{treasurySol}</code>
            </>
          ) : null}
        </p>
      )}
      {msg ? (
        <p
          style={{
            margin: "0.35rem 0 0",
            fontSize: "0.8rem",
            color: "var(--emergent)",
          }}
        >
          {msg}
        </p>
      ) : null}
    </div>
  );
}
