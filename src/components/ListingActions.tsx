"use client";

import {
  PLATFORM_FEE_PERCENT,
  splitSaleProceeds,
} from "@/lib/fees/platform";
import type { Chain, NetworkId } from "@/lib/discovery/types";
import { quoteNativeFromUsd } from "@/lib/onchain/fx";
import {
  maybeSendWalletTx,
  requestBuyerAddress,
  sendEvmWalletTx,
  type EvmWalletTx,
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

function vmForNetwork(network: string): Chain {
  if (network === "solana") return "solana";
  if (network === "boing") return "boing";
  return "evm";
}

export function ListingActions({
  listingId,
  creatorId,
  priceUsd,
  stage,
  sold = false,
  listingType,
  chain = "evm",
  network,
  dropState = "none",
  repeatable = false,
}: {
  listingId: string;
  creatorId?: string;
  priceUsd: number | null;
  stage: string;
  sold?: boolean;
  listingType?: string;
  chain?: Chain;
  network?: NetworkId | string;
  dropState?: "none" | "upcoming" | "live" | "ended";
  repeatable?: boolean;
}) {
  const router = useRouter();
  const listingNetwork = (network ??
    (chain === "solana"
      ? "solana"
      : chain === "boing"
        ? "boing"
        : "ethereum")) as NetworkId;
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmBuy, setConfirmBuy] = useState(false);
  const [buying, setBuying] = useState(false);
  const [justSold, setJustSold] = useState(false);
  const [payNetwork, setPayNetwork] = useState<NetworkId>(listingNetwork);
  const [payNetworks, setPayNetworks] = useState<NetworkId[]>([
    listingNetwork,
  ]);

  const feePreview =
    priceUsd != null && priceUsd > 0 ? splitSaleProceeds(priceUsd) : null;
  const nativeQuote = useMemo(() => {
    if (priceUsd == null || !(priceUsd > 0)) return null;
    return quoteNativeFromUsd(priceUsd, chain);
  }, [priceUsd, chain]);
  const uniqueSold = sold || justSold;
  const canBuy =
    priceUsd != null &&
    !uniqueSold &&
    dropState !== "upcoming" &&
    dropState !== "ended";

  async function post(url: string, body: Record<string, unknown>) {
    setMsg(null);
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        setMsg("sign_in");
        return { error: "sign_in" };
      }
      const raw = data.error || data.errors?.join(", ") || "failed";
      const error =
        raw === "self_purchase"
          ? "You can't buy your own work"
          : raw === "already_sold"
            ? "already_sold"
            : raw === "drop_not_started"
              ? "This drop hasn't started yet"
              : raw === "drop_ended"
                ? "This drop has ended"
                : raw === "unavailable"
                  ? "This work isn't available to buy"
                  : raw === "listing_not_minted"
                    ? "This listing isn't minted on-chain yet"
                    : raw === "boing_same_chain_only"
                      ? "Boing listings are same-chain only (pay with BOING)"
                      : raw === "wash_blocked" || raw === "high_velocity_low_dwell"
                        ? "Purchase blocked"
                        : raw === "invalid_body"
                          ? "Couldn't start this purchase. Try again."
                          : raw;
      setMsg(error);
      return { error };
    }
    return data as Record<string, unknown>;
  }

  async function openCheckout() {
    setMsg(null);
    setConfirmBuy(true);
    setPayNetwork(listingNetwork);
    const quote = await post("/api/purchase/quote", {
      listingId,
      payNetwork: listingNetwork,
    });
    if (quote && !("error" in quote) && Array.isArray(quote.payNetworks)) {
      setPayNetworks(quote.payNetworks as NetworkId[]);
    } else if (listingNetwork === "boing") {
      setPayNetworks(["boing"]);
    } else {
      setPayNetworks([
        listingNetwork,
        "ethereum",
        "base",
        "arbitrum",
        "optimism",
        "solana",
      ].filter((n, i, a) => a.indexOf(n) === i) as NetworkId[]);
    }
  }

  async function completePurchase() {
    const amount = Number(priceUsd);
    if (!Number.isFinite(amount) || amount <= 0 || buying) return;
    setBuying(true);
    try {
      const payVm = vmForNetwork(payNetwork);
      const listingVm = chain;
      const paymentAddress = await requestBuyerAddress(payVm);
      if (!paymentAddress) {
        setMsg(`Connect a ${PAY_LABELS[payNetwork] ?? payNetwork} wallet to pay`);
        return;
      }
      let receiveAddress = paymentAddress;
      if (payNetwork !== listingNetwork) {
        const recv = await requestBuyerAddress(listingVm);
        if (!recv) {
          setMsg(`Connect a ${chain} wallet to receive the NFT`);
          return;
        }
        receiveAddress = recv;
      }

      const data = await post("/api/purchase", {
        listingId,
        amountUsd: amount,
        payNetwork,
        buyerPaymentAddress: paymentAddress,
        buyerReceiveAddress: receiveAddress,
      });
      if (!data || "error" in data) {
        if (data && data.error === "already_sold") {
          setJustSold(true);
          setConfirmBuy(false);
        }
        return;
      }

      const purchaseId = String(data.purchaseId ?? "");
      let paymentHash: string | null = null;
      let bridgeRequestId =
        data.bridge &&
        typeof data.bridge === "object" &&
        data.bridge !== null &&
        "requestId" in data.bridge
          ? String((data.bridge as { requestId?: string }).requestId ?? "")
          : "";

      if (payNetwork !== listingNetwork && data.bridge) {
        const bridge = data.bridge as {
          amount?: string;
          requestId?: string;
        };
        const prep = await fetch("/api/bridge/prepare", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromNetwork: payNetwork,
            toNetwork: listingNetwork,
            amount: bridge.amount,
            userAddress: paymentAddress,
            recipientAddress:
              typeof data.settlementAddress === "string"
                ? data.settlementAddress
                : undefined,
          }),
        });
        const prepData = await prep.json();
        if (!prep.ok) {
          setMsg(prepData.error || "bridge_prepare_failed");
          return;
        }
        bridgeRequestId =
          prepData.requestId ?? prepData.quote?.requestId ?? bridgeRequestId;
        const hashes: string[] = [];
        for (const step of prepData.walletSteps ?? []) {
          if (step.chain === "evm" && step.to && step.data) {
            const hash = await sendEvmWalletTx({
              chain: "evm",
              chainId: step.chainId,
              to: step.to,
              data: step.data,
              value: step.value ?? "0x0",
              from: paymentAddress,
            });
            hashes.push(hash);
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
        paymentHash = await maybeSendWalletTx({
          walletTx: data.paymentWalletTx,
          listingId,
          action: "buy",
          amountUsd: amount,
        });
        if (!paymentHash) {
          setMsg("Confirm the payment in your wallet");
          return;
        }
      }

      if (!paymentHash || !purchaseId) {
        setMsg("Payment required to continue");
        return;
      }

      const paid = await post("/api/purchase/confirm", {
        purchaseId,
        step: "payment",
        txHash: paymentHash,
        bridgeRequestId: bridgeRequestId || undefined,
      });
      if (!paid || "error" in paid) return;

      const transferTx =
        paid.transferWalletTx ?? data.transferWalletTx;
      let transferHash: string | null = null;
      if (transferTx) {
        const wt = transferTx as EvmWalletTx & { chain: string };
        if (wt.chain === "evm") {
          transferHash = await sendEvmWalletTx(wt);
        } else {
          transferHash = await maybeSendWalletTx({
            walletTx: transferTx,
            listingId,
            action: "buy",
            amountUsd: amount,
          });
        }
      }
      if (!transferHash) {
        setMsg("Confirm the NFT transfer in your wallet");
        return;
      }

      const done = await post("/api/purchase/confirm", {
        purchaseId,
        step: "transfer",
        txHash: transferHash,
      });
      if (!done || "error" in done) return;

      finishPurchase(
        { ...data, ...done, fees: data.fees },
        "Owned on-chain",
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "purchase_failed");
    } finally {
      setBuying(false);
    }
  }

  function finishPurchase(data: Record<string, unknown>, prefix: string) {
    const feeNote =
      data.fees &&
      typeof data.fees === "object" &&
      data.fees !== null &&
      "sellerNetUsd" in data.fees
        ? ` · seller $${Number((data.fees as { sellerNetUsd: number }).sellerNetUsd).toFixed(2)} after ${PLATFORM_FEE_PERCENT.total}% fee`
        : "";
    setConfirmBuy(false);
    if (!repeatable && listingType !== "open_edition") setJustSold(true);
    setMsg(`${prefix}${feeNote}`);
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.6rem" }}>
      {creatorId ? (
        <button
          type="button"
          className="badge emerging"
          style={{ cursor: "pointer", background: "transparent" }}
          onClick={() =>
            void post("/api/follow", { artistId: creatorId }).then((d) => {
              if (d) {
                setMsg("Following");
                router.refresh();
              }
            })
          }
        >
          Follow
        </button>
      ) : null}
      <button
        type="button"
        className="badge"
        style={{ cursor: "pointer", background: "transparent" }}
        onClick={() =>
          void post("/api/signals", { listingId, type: "save" }).then((d) => {
            if (d) {
              setMsg("Saved");
              router.refresh();
            }
          })
        }
      >
        Save
      </button>
      <button
        type="button"
        className="badge"
        style={{ cursor: "pointer", background: "transparent" }}
        onClick={() =>
          void post("/api/nominate", { listingId }).then((d) => {
            if (d) {
              setMsg("Nominated (−10 curator pts)");
              router.refresh();
            }
          })
        }
      >
        Nominate
      </button>
      {uniqueSold ? <span className="badge featured">Sold</span> : null}
      {dropState === "upcoming" ? (
        <span className="badge emerging">Drop scheduled</span>
      ) : null}
      {dropState === "ended" && !uniqueSold ? (
        <span className="badge">Drop ended</span>
      ) : null}
      {canBuy && !confirmBuy ? (
        <button
          type="button"
          className="badge featured"
          style={{ cursor: "pointer", background: "transparent" }}
          onClick={() => void openCheckout()}
        >
          Buy {nativeQuote?.formatted ?? `$${priceUsd}`}
        </button>
      ) : null}
      {canBuy && confirmBuy ? (
        <div
          style={{
            width: "100%",
            maxWidth: "22rem",
            marginTop: "0.15rem",
            padding: "0.75rem 0.85rem",
            border: "1px solid var(--line)",
            background: "var(--panel-solid)",
          }}
        >
          <p
            className="display"
            style={{ margin: "0 0 0.35rem", fontSize: "1rem" }}
          >
            Confirm purchase · {nativeQuote?.formatted ?? `$${priceUsd}`}
          </p>
          {feePreview ? (
            <p
              style={{
                margin: "0 0 0.75rem",
                color: "var(--ink-muted)",
                fontSize: "0.8rem",
                lineHeight: 1.45,
              }}
            >
              Pay crypto and receive the NFT in your {chain} wallet.{" "}
              {PLATFORM_FEE_PERCENT.total}% treasury fee. Seller nets $
              {feePreview.sellerNetUsd.toFixed(2)}.
              {payNetwork !== listingNetwork
                ? " Cross-chain: bridge via Relay, then transfer on the listing network."
                : ""}
            </p>
          ) : null}
          <label
            style={{
              display: "block",
              marginBottom: "0.65rem",
              fontSize: "0.8rem",
              color: "var(--ink-muted)",
            }}
          >
            Pay with
            <select
              value={payNetwork}
              onChange={(e) => setPayNetwork(e.target.value as NetworkId)}
              style={{
                display: "block",
                width: "100%",
                marginTop: "0.25rem",
                padding: "0.35rem 0.45rem",
              }}
            >
              {payNetworks.map((n) => (
                <option key={n} value={n}>
                  {PAY_LABELS[n] ?? n}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            <button
              type="button"
              className="badge featured"
              disabled={buying}
              style={{ cursor: buying ? "wait" : "pointer", background: "transparent" }}
              onClick={() => void completePurchase()}
            >
              {buying
                ? "Buying…"
                : payNetwork !== listingNetwork
                  ? "Bridge & buy"
                  : "Confirm buy"}
            </button>
            <button
              type="button"
              className="badge"
              disabled={buying}
              style={{ cursor: "pointer", background: "transparent" }}
              onClick={() => setConfirmBuy(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {stage === "soft_launch" ? (
        <button
          type="button"
          className="badge emerging"
          style={{ cursor: "pointer", background: "transparent" }}
          onClick={() =>
            void post(`/api/listings/${listingId}/stage`, {
              target: "rising_eligible",
            }).then((d) => {
              if (d) {
                setMsg("Pushed to Rising");
                router.refresh();
              }
            })
          }
        >
          Push to Rising
        </button>
      ) : null}
      <button
        type="button"
        className="badge"
        style={{
          cursor: "pointer",
          background: "transparent",
          color: "var(--danger)",
        }}
        onClick={() =>
          void post(`/api/listings/${listingId}/report`, {
            reason: "spam",
          }).then((d) => {
            if (d) setMsg("Reported");
          })
        }
      >
        Report
      </button>
      {msg === "sign_in" ? (
        <span style={{ fontSize: "0.8rem" }}>
          <Link href="/api/auth/signin">Sign in</Link> to collect
        </span>
      ) : msg ? (
        <span style={{ color: "var(--ink-muted)", fontSize: "0.8rem" }}>{msg}</span>
      ) : null}
    </div>
  );
}
