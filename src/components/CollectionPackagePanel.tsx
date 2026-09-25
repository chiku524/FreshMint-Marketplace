"use client";

import { BridgeQuoteSummary } from "@/components/BridgeQuoteSummary";
import {
  humanizeCheckoutError,
  resolveBuyPrimaryCta,
} from "@/lib/marketplace/buy-auth-cta";
import Link from "next/link";
import type { Chain } from "@/lib/discovery/types";
import {
  browserWalletAvailable,
  requestBuyerAddress,
} from "@/lib/onchain/wallet-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Eligibility = {
  ok: boolean;
  reason?: string;
  listings?: { id: string; title: string; priceUsd: number }[];
  defaultPriceUsd?: number;
  network?: string | null;
  packageSellEnabled?: boolean;
  packagePriceUsd?: number | null;
  payNetworks?: string[];
};

const PAY_LABELS: Record<string, string> = {
  ethereum: "Ethereum (ETH)",
  base: "Base (ETH)",
  arbitrum: "Arbitrum (ETH)",
  optimism: "Optimism (ETH)",
  solana: "Solana (SOL)",
  boing: "Boing (BOING)",
};

function vmForNetwork(network: string): Chain {
  if (network === "solana") return "solana";
  if (network === "boing") return "boing";
  return "evm";
}

export function CollectionPackagePanel({
  collectionId,
  isOwner,
}: {
  collectionId: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<Eligibility | null>(null);
  const [price, setPrice] = useState("");
  const [payNetwork, setPayNetwork] = useState("ethereum");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [paymentAddress, setPaymentAddress] = useState<string | null>(null);
  const [receiveAddress, setReceiveAddress] = useState<string | null>(null);
  const [bridgeFeeUsd, setBridgeFeeUsd] = useState<string | null>(null);
  const [bridgeEstimatedOutput, setBridgeEstimatedOutput] = useState<
    string | null
  >(null);
  const [bridgeQuoteRequestId, setBridgeQuoteRequestId] = useState<
    string | null
  >(null);
  const [bridgeQuoteLoading, setBridgeQuoteLoading] = useState(false);
  const [showSimulate, setShowSimulate] = useState(false);
  const [sessionUserId, setSessionUserId] = useState<
    string | null | undefined
  >(undefined);

  function load() {
    void fetch(`/api/collections/${collectionId}/package`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Eligibility | null) => {
        if (!d) return;
        setData(d);
        setPrice(String(d.packagePriceUsd ?? d.defaultPriceUsd ?? ""));
        const nets = d.payNetworks?.length
          ? d.payNetworks
          : d.network
            ? [d.network]
            : ["ethereum"];
        setPayNetwork(nets[0]!);
      })
      .catch(() => setData(null));
  }

  useEffect(() => {
    load();
  }, [collectionId]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { user?: { id?: string } } | null) => {
        if (cancelled) return;
        setSessionUserId(d?.user?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setSessionUserId(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const listingNetwork = data?.network ?? null;
  const crossChain = Boolean(listingNetwork && payNetwork !== listingNetwork);

  // Live Relay quote when pay network differs — no polling; refetch on deps.
  useEffect(() => {
    if (!data?.packageSellEnabled || isOwner || !crossChain) {
      return;
    }
    let cancelled = false;
    const canLive = Boolean(paymentAddress);
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setBridgeQuoteLoading(canLive);
      if (!canLive) {
        setBridgeFeeUsd(null);
        setBridgeEstimatedOutput(null);
        setBridgeQuoteRequestId(null);
        setBridgeQuoteLoading(false);
        return;
      }
      void fetch(`/api/collections/${collectionId}/package`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payNetwork,
          quoteOnly: true,
          buyerPaymentAddress: paymentAddress,
        }),
      })
        .then(async (res) => {
          const body = await res.json();
          if (cancelled) return;
          if (!res.ok) {
            setBridgeFeeUsd(null);
            setBridgeEstimatedOutput(null);
            setBridgeQuoteRequestId(null);
            return;
          }
          const bridge = body.bridge as
            | {
                feeUsd?: string | null;
                estimatedOutput?: string | null;
                requestId?: string | null;
              }
            | null
            | undefined;
          setBridgeFeeUsd(bridge?.feeUsd ?? null);
          setBridgeEstimatedOutput(bridge?.estimatedOutput ?? null);
          setBridgeQuoteRequestId(bridge?.requestId ?? null);
        })
        .catch(() => {
          if (!cancelled) {
            setBridgeFeeUsd(null);
            setBridgeEstimatedOutput(null);
            setBridgeQuoteRequestId(null);
          }
        })
        .finally(() => {
          if (!cancelled) setBridgeQuoteLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    collectionId,
    payNetwork,
    paymentAddress,
    crossChain,
    data?.packageSellEnabled,
    isOwner,
  ]);

  if (!data) return null;
  const count = data.listings?.length ?? 0;
  if (!isOwner && (!data.packageSellEnabled || count < 2)) return null;

  const payNetworks =
    data.payNetworks && data.payNetworks.length > 0
      ? data.payNetworks
      : data.network
        ? [data.network]
        : ["ethereum"];

  async function connectWallets() {
    setMsg(null);
    try {
      const payVm = vmForNetwork(payNetwork);
      const recvVm = vmForNetwork(listingNetwork ?? payNetwork);
      if (!browserWalletAvailable(payVm)) {
        throw new Error(`Connect a ${payVm} wallet for payment`);
      }
      const pay = await requestBuyerAddress(payVm);
      if (!pay) throw new Error("Payment wallet connection cancelled");
      setPaymentAddress(pay);
      if (recvVm === payVm) {
        setReceiveAddress(pay);
      } else {
        if (!browserWalletAvailable(recvVm)) {
          throw new Error(`Connect a ${recvVm} wallet to receive NFTs`);
        }
        const recv = await requestBuyerAddress(recvVm);
        if (!recv) throw new Error("Receive wallet connection cancelled");
        setReceiveAddress(recv);
      }
    } catch (err) {
      setMsg(humanizeCheckoutError(err instanceof Error ? err.message : "wallet_connect_failed"));
    }
  }

  async function toggle(enabled: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/collections/${collectionId}/package`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageSellEnabled: enabled,
          packagePriceUsd: price ? Number(price) : null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "update_failed");
      setMsg(enabled ? "Package sell enabled" : "Package sell disabled");
      load();
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "update_failed");
    } finally {
      setBusy(false);
    }
  }

  async function buy(opts: { simulate: boolean }) {
    setBusy(true);
    setMsg(null);
    try {
      const payAddr =
        opts.simulate ? paymentAddress || "0xbuyer-sim" : paymentAddress;
      const recvAddr =
        opts.simulate ? receiveAddress || paymentAddress || "0xbuyer-sim" : receiveAddress;
      if (!payAddr || !recvAddr) {
        throw new Error("Connect payment (and receive) wallet first");
      }
      const res = await fetch(`/api/collections/${collectionId}/package`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payNetwork,
          buyerPaymentAddress: payAddr,
          buyerReceiveAddress: recvAddr,
          ...(opts.simulate ? { simulate: true } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "buy_failed");
      const bridgeNote = body.bridged
        ? " One Relay bridge for the package total, then same-chain NFT transfers."
        : " Same-network checkout.";
      const simNote = opts.simulate
        ? " (simulated — no on-chain payment; for preview only.)"
        : "";
      setMsg(
        `Package prepared (${body.purchaseIds?.length ?? 0} works, $${body.amountUsd}).${bridgeNote}${simNote}`,
      );
      load();
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "buy_failed");
    } finally {
      setBusy(false);
    }
  }

  const packagePriceLabel = price || data.defaultPriceUsd;

  return (
    <section
      style={{
        margin: "1.25rem 0 1.75rem",
        border: "1px solid var(--line)",
        padding: "1rem 1.1rem",
        background: "var(--panel)",
        maxWidth: "36rem",
      }}
    >
      <h2 className="display" style={{ margin: "0 0 0.4rem", fontSize: "1.2rem" }}>
        Remaining works package
      </h2>
      <p style={{ margin: "0 0 0.75rem", color: "var(--ink-muted)", fontSize: "0.9rem" }}>
        {count} unsold minted works
        {data.defaultPriceUsd != null ? ` · default $${data.defaultPriceUsd}` : ""}
        {data.network ? ` · receive on ${data.network}` : ""}.
        Pay on the listing network or bridge once via Relay for the package total.
      </p>
      {isOwner ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <label style={{ fontSize: "0.85rem" }}>
            Package price USD
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              style={{ display: "block", marginTop: 4, width: "8rem" }}
            />
          </label>
          <button
            type="button"
            className="badge featured"
            disabled={busy || count < 2}
            style={{ cursor: "pointer", background: "transparent" }}
            onClick={() => void toggle(!data.packageSellEnabled)}
          >
            {data.packageSellEnabled ? "Disable package sell" : "Sell remaining as package"}
          </button>
        </div>
      ) : null}
      {!isOwner && data.packageSellEnabled && count >= 2 ? (
        <div style={{ display: "grid", gap: "0.55rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <label style={{ fontSize: "0.85rem" }}>
              Pay from
              <select
                value={payNetwork}
                onChange={(e) => setPayNetwork(e.target.value)}
                style={{ display: "block", marginTop: 4, minWidth: "10rem" }}
              >
                {payNetworks.map((n) => (
                  <option key={n} value={n}>
                    {PAY_LABELS[n] ?? n}
                    {data.network && n === data.network ? " (listing)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {(() => {
              const primary = resolveBuyPrimaryCta({
                sessionUserId,
                confirmOpen: true,
                paymentAddress,
                crossChain,
                buying: busy,
                busyLabel: crossChain
                  ? "Bridging & paying…"
                  : "Paying…",
              });
              if (primary.kind === "checking") {
                return (
                  <button
                    type="button"
                    className="badge featured"
                    disabled
                    style={{ cursor: "wait", background: "transparent" }}
                  >
                    {primary.label}
                  </button>
                );
              }
              if (primary.kind === "sign_in") {
                return (
                  <Link
                    href={`/sign-in?next=/collections/${collectionId}`}
                    className="badge featured"
                  >
                    {primary.label}
                  </Link>
                );
              }
              return (
                <>
                  <button
                    type="button"
                    className="badge"
                    style={{ cursor: "pointer", background: "transparent" }}
                    onClick={() => void connectWallets()}
                    disabled={busy}
                  >
                    {paymentAddress ? "Wallet connected" : "Connect wallet"}
                  </button>
                  <button
                    type="button"
                    className="badge featured"
                    disabled={
                      busy ||
                      (!paymentAddress && !showSimulate) ||
                      primary.kind === "connect_wallet"
                    }
                    style={{
                      cursor: busy ? "wait" : "pointer",
                      background: "transparent",
                    }}
                    onClick={() => void buy({ simulate: false })}
                  >
                    {busy
                      ? primary.label
                      : crossChain
                        ? `Bridge & buy package ($${packagePriceLabel})`
                        : `Buy remaining works ($${packagePriceLabel})`}
                  </button>
                </>
              );
            })()}
          </div>
          {crossChain ? (
            <BridgeQuoteSummary
              feeUsd={paymentAddress ? bridgeFeeUsd : null}
              estimatedOutput={paymentAddress ? bridgeEstimatedOutput : null}
              requestId={paymentAddress ? bridgeQuoteRequestId : null}
              loading={Boolean(paymentAddress) && bridgeQuoteLoading}
              needsWallet={!paymentAddress}
              onConnectWallet={() => void connectWallets()}
            />
          ) : null}
          <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)" }}>
            <button
              type="button"
              className="badge"
              style={{
                cursor: "pointer",
                background: "transparent",
                opacity: 0.85,
              }}
              onClick={() => setShowSimulate((v) => !v)}
            >
              {showSimulate ? "Hide simulate fallback" : "Show simulate fallback"}
            </button>
            {showSimulate ? (
              <div style={{ marginTop: "0.45rem" }}>
                <p style={{ margin: "0 0 0.4rem" }}>
                  Simulate prepares package rows without a real wallet payment —
                  preview / local testing only.
                </p>
                <button
                  type="button"
                  className="badge"
                  disabled={busy}
                  style={{ cursor: "pointer", background: "transparent" }}
                  onClick={() => void buy({ simulate: true })}
                >
                  Simulate package buy
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {msg ? (
        <p style={{ margin: "0.55rem 0 0", fontSize: "0.85rem", color: "var(--ink-muted)" }}>
          {msg}
        </p>
      ) : null}
    </section>
  );
}
