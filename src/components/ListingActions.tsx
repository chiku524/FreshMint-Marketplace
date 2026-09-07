"use client";

import {
  PLATFORM_FEE_PERCENT,
  splitSaleProceeds,
} from "@/lib/fees/platform";
import type { Chain, NetworkId } from "@/lib/discovery/types";
import { quoteNativeFromUsd, quotePayInFromUsdAt } from "@/lib/onchain/fx";
import {
  browserWalletAvailable,
  maybeSendWalletTx,
  requestBuyerAddress,
  sendEvmWalletTx,
  type EvmWalletTx,
} from "@/lib/onchain/wallet-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const PAY_LABELS: Record<string, string> = {
  ethereum: "Ethereum (ETH)",
  base: "Base (ETH)",
  arbitrum: "Arbitrum (ETH)",
  optimism: "Optimism (ETH)",
  solana: "Solana (SOL)",
  boing: "Boing (BOING)",
};

const WALLET_HINT: Record<string, string> = {
  evm: "MetaMask / Rabby",
  solana: "Phantom",
  boing: "Boing Express",
};

type BuyStep =
  | "idle"
  | "connecting"
  | "bridging"
  | "paying"
  | "transferring"
  | "done";

function vmForNetwork(network: string): Chain {
  if (network === "solana") return "solana";
  if (network === "boing") return "boing";
  return "evm";
}

function shortAddr(addr: string) {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function stepLabel(step: BuyStep, crossChain: boolean): string {
  switch (step) {
    case "connecting":
      return "Connect wallet…";
    case "bridging":
      return "Bridge via Relay…";
    case "paying":
      return crossChain ? "Confirming bridge…" : "Confirm payment…";
    case "transferring":
      return "Transfer NFT to your wallet…";
    case "done":
      return "Owned on-chain";
    default:
      return crossChain ? "Bridge & buy" : "Confirm buy";
  }
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
  minted = true,
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
  /** Listing has tokenId + contract + mint tx from publish. */
  minted?: boolean;
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
  const [buyStep, setBuyStep] = useState<BuyStep>("idle");
  const [justSold, setJustSold] = useState(false);
  const [payNetwork, setPayNetwork] = useState<NetworkId>(listingNetwork);
  const [payNetworks, setPayNetworks] = useState<NetworkId[]>([
    listingNetwork,
  ]);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [serverPayFormatted, setServerPayFormatted] = useState<string | null>(
    null,
  );
  const [paymentAddress, setPaymentAddress] = useState<string | null>(null);
  const [receiveAddress, setReceiveAddress] = useState<string | null>(null);

  const feePreview =
    priceUsd != null && priceUsd > 0 ? splitSaleProceeds(priceUsd) : null;
  const settleQuote = useMemo(() => {
    if (priceUsd == null || !(priceUsd > 0)) return null;
    return quoteNativeFromUsd(priceUsd, chain);
  }, [priceUsd, chain]);
  const localPayQuote = useMemo(() => {
    if (priceUsd == null || !(priceUsd > 0)) return null;
    return quotePayInFromUsdAt({
      amountUsd: priceUsd,
      listingChain: chain,
      payNetwork,
    });
  }, [priceUsd, chain, payNetwork]);

  const crossChain = payNetwork !== listingNetwork;
  const uniqueSold = sold || justSold;
  const canBuy =
    minted &&
    priceUsd != null &&
    !uniqueSold &&
    dropState !== "upcoming" &&
    dropState !== "ended";

  const payVm = vmForNetwork(payNetwork);
  const payWalletReady = browserWalletAvailable(payVm);
  const recvWalletReady = browserWalletAvailable(chain);

  useEffect(() => {
    if (!confirmBuy || !priceUsd) return;
    let cancelled = false;
    setQuoteBusy(true);
    void fetch("/api/purchase/quote", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId, payNetwork }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          if (data.error === "boing_same_chain_only") {
            setMsg("Boing listings are same-chain only (pay with BOING)");
          } else if (data.error === "listing_not_minted") {
            setMsg("This listing isn't minted on-chain yet");
          } else if (res.status === 401) {
            setMsg("sign_in");
          }
          setServerPayFormatted(null);
          return;
        }
        if (Array.isArray(data.payNetworks)) {
          setPayNetworks(data.payNetworks as NetworkId[]);
        }
        const pay = data.quote?.pay?.formatted as string | undefined;
        setServerPayFormatted(pay ?? null);
      })
      .catch(() => {
        if (!cancelled) setServerPayFormatted(null);
      })
      .finally(() => {
        if (!cancelled) setQuoteBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [confirmBuy, listingId, payNetwork, priceUsd]);

  async function post(url: string, body: Record<string, unknown>) {
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
    setBuyStep("idle");
    setPayNetwork(listingNetwork);
    setPaymentAddress(null);
    setReceiveAddress(null);
    setServerPayFormatted(null);
    if (listingNetwork === "boing") {
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

  async function connectWallets() {
    setBuyStep("connecting");
    setMsg(null);
    const payAddr = await requestBuyerAddress(payVm);
    if (!payAddr) {
      setMsg(
        `Install or unlock ${WALLET_HINT[payVm] ?? "a wallet"} to pay on ${PAY_LABELS[payNetwork] ?? payNetwork}`,
      );
      setBuyStep("idle");
      return null;
    }
    setPaymentAddress(payAddr);
    let recv = payAddr;
    if (crossChain) {
      const recvAddr = await requestBuyerAddress(chain);
      if (!recvAddr) {
        setMsg(
          `Also connect ${WALLET_HINT[chain] ?? "a wallet"} on ${chain} to receive the NFT`,
        );
        setBuyStep("idle");
        return null;
      }
      recv = recvAddr;
    }
    setReceiveAddress(recv);
    return { payAddr, recv };
  }

  async function completePurchase() {
    const amount = Number(priceUsd);
    if (!Number.isFinite(amount) || amount <= 0 || buying) return;
    setBuying(true);
    setMsg(null);
    try {
      const wallets = await connectWallets();
      if (!wallets) return;

      const data = await post("/api/purchase", {
        listingId,
        amountUsd: amount,
        payNetwork,
        buyerPaymentAddress: wallets.payAddr,
        buyerReceiveAddress: wallets.recv,
      });
      if (!data || "error" in data) {
        if (data && data.error === "already_sold") {
          setJustSold(true);
          setConfirmBuy(false);
        }
        setBuyStep("idle");
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

      if (crossChain && data.bridge) {
        setBuyStep("bridging");
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
            userAddress: wallets.payAddr,
            recipientAddress:
              typeof data.settlementAddress === "string"
                ? data.settlementAddress
                : undefined,
          }),
        });
        const prepData = await prep.json();
        if (!prep.ok) {
          setMsg(prepData.error || "Couldn’t prepare the bridge. Try again.");
          setBuyStep("idle");
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
              from: wallets.payAddr,
            });
            hashes.push(hash);
          }
        }
        paymentHash = hashes[0] ?? `bridge:${bridgeRequestId || Date.now()}`;
        setBuyStep("paying");
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
        setBuyStep("paying");
        paymentHash = await maybeSendWalletTx({
          walletTx: data.paymentWalletTx,
          listingId,
          action: "buy",
          amountUsd: amount,
        });
        if (!paymentHash) {
          setMsg("Confirm the payment in your wallet popup");
          setBuyStep("idle");
          return;
        }
      }

      if (!paymentHash || !purchaseId) {
        setMsg("Payment required to continue");
        setBuyStep("idle");
        return;
      }

      const paid = await post("/api/purchase/confirm", {
        purchaseId,
        step: "payment",
        txHash: paymentHash,
        bridgeRequestId: bridgeRequestId || undefined,
      });
      if (!paid || "error" in paid) {
        setBuyStep("idle");
        return;
      }

      setBuyStep("transferring");
      const transferTx = paid.transferWalletTx ?? data.transferWalletTx;
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
        setMsg(
          "Payment landed — confirm the NFT transfer in your wallet to finish",
        );
        setBuyStep("idle");
        return;
      }

      const done = await post("/api/purchase/confirm", {
        purchaseId,
        step: "transfer",
        txHash: transferHash,
      });
      if (!done || "error" in done) {
        setBuyStep("idle");
        return;
      }

      setBuyStep("done");
      finishPurchase(
        { ...data, ...done, fees: data.fees },
        "Owned on-chain",
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "purchase_failed");
      setBuyStep("idle");
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
    setBuyStep("idle");
    if (!repeatable && listingType !== "open_edition") setJustSold(true);
    setMsg(`${prefix}${feeNote}`);
    router.refresh();
  }

  const payAmountLabel =
    serverPayFormatted ??
    localPayQuote?.pay.formatted ??
    settleQuote?.formatted ??
    `$${priceUsd}`;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.6rem" }}>
      {creatorId ? (
        <button
          type="button"
          className="badge emerging"
          style={{ cursor: "pointer", background: "transparent" }}
          onClick={() =>
            void post("/api/follow", { artistId: creatorId }).then((d) => {
              if (d && !("error" in d)) {
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
            if (d && !("error" in d)) {
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
            if (d && !("error" in d)) {
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
      {!minted && !uniqueSold && priceUsd != null ? (
        <span className="badge" title="Creator must finish publish mint first">
          Not minted yet
        </span>
      ) : null}
      {canBuy && !confirmBuy ? (
        <button
          type="button"
          className="badge featured"
          style={{ cursor: "pointer", background: "transparent" }}
          onClick={() => void openCheckout()}
        >
          Buy {settleQuote?.formatted ?? `$${priceUsd}`}
          {priceUsd != null ? (
            <span style={{ opacity: 0.75 }}> · ${priceUsd}</span>
          ) : null}
        </button>
      ) : null}
      {canBuy && confirmBuy ? (
        <div
          style={{
            width: "100%",
            maxWidth: "24rem",
            marginTop: "0.15rem",
            padding: "0.75rem 0.85rem",
            border: "1px solid var(--line)",
            background: "var(--panel-solid)",
          }}
        >
          <p
            className="display"
            style={{ margin: "0 0 0.25rem", fontSize: "1rem" }}
          >
            {payAmountLabel}
            {priceUsd != null ? (
              <span
                style={{
                  marginLeft: "0.35rem",
                  color: "var(--ink-muted)",
                  fontSize: "0.85rem",
                  fontWeight: 400,
                }}
              >
                ≈ ${priceUsd}
              </span>
            ) : null}
          </p>
          {feePreview ? (
            <p
              style={{
                margin: "0 0 0.65rem",
                color: "var(--ink-muted)",
                fontSize: "0.8rem",
                lineHeight: 1.45,
              }}
            >
              Lands in your {chain} wallet. {PLATFORM_FEE_PERCENT.total}% treasury
              · seller ${feePreview.sellerNetUsd.toFixed(2)}.
            </p>
          ) : null}

          <ol
            style={{
              margin: "0 0 0.75rem",
              paddingLeft: "1.1rem",
              color: "var(--ink-muted)",
              fontSize: "0.78rem",
              lineHeight: 1.45,
            }}
          >
            <li style={{ opacity: buyStep === "connecting" ? 1 : 0.75 }}>
              Connect {WALLET_HINT[payVm]}
              {crossChain ? ` + ${WALLET_HINT[chain]}` : ""}
            </li>
            <li
              style={{
                opacity:
                  buyStep === "bridging" || buyStep === "paying" ? 1 : 0.75,
              }}
            >
              {crossChain
                ? `Bridge ${PAY_LABELS[payNetwork] ?? payNetwork} → ${PAY_LABELS[listingNetwork] ?? listingNetwork}`
                : `Pay on ${PAY_LABELS[listingNetwork] ?? listingNetwork}`}
            </li>
            <li style={{ opacity: buyStep === "transferring" ? 1 : 0.75 }}>
              Receive NFT transfer on {chain}
            </li>
          </ol>

          <label
            style={{
              display: "block",
              marginBottom: "0.55rem",
              fontSize: "0.8rem",
              color: "var(--ink-muted)",
            }}
          >
            Pay with
            <select
              value={payNetwork}
              disabled={buying}
              onChange={(e) => {
                setPayNetwork(e.target.value as NetworkId);
                setPaymentAddress(null);
                setReceiveAddress(null);
                setMsg(null);
              }}
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
                  {n === listingNetwork ? " · listing network" : ""}
                </option>
              ))}
            </select>
          </label>

          <p
            style={{
              margin: "0 0 0.65rem",
              fontSize: "0.75rem",
              color: "var(--ink-muted)",
              lineHeight: 1.4,
            }}
          >
            {quoteBusy ? "Updating quote…" : null}
            {!quoteBusy && crossChain ? (
              <>
                Cross-chain via Relay. You pay on{" "}
                {PAY_LABELS[payNetwork] ?? payNetwork}; NFT stays on{" "}
                {PAY_LABELS[listingNetwork] ?? listingNetwork}.
              </>
            ) : null}
            {!quoteBusy && !crossChain && !payWalletReady ? (
              <>Needs {WALLET_HINT[payVm]} in this browser.</>
            ) : null}
            {!quoteBusy && crossChain && (!payWalletReady || !recvWalletReady) ? (
              <>
                Needs {WALLET_HINT[payVm]}
                {!recvWalletReady ? ` and ${WALLET_HINT[chain]}` : ""}.
              </>
            ) : null}
            {paymentAddress ? (
              <>
                {" "}
                Pay from {shortAddr(paymentAddress)}
                {receiveAddress && receiveAddress !== paymentAddress
                  ? ` · receive ${shortAddr(receiveAddress)}`
                  : ""}
                .
              </>
            ) : null}
          </p>

          {buying || buyStep !== "idle" ? (
            <p
              style={{
                margin: "0 0 0.55rem",
                fontSize: "0.8rem",
                color: "var(--accent-soft)",
              }}
              aria-live="polite"
            >
              {stepLabel(buyStep === "idle" && buying ? "connecting" : buyStep, crossChain)}
            </p>
          ) : null}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            <button
              type="button"
              className="badge featured"
              disabled={buying}
              style={{
                cursor: buying ? "wait" : "pointer",
                background: "transparent",
              }}
              onClick={() => void completePurchase()}
            >
              {buying
                ? stepLabel(buyStep === "idle" ? "connecting" : buyStep, crossChain)
                : crossChain
                  ? "Bridge & buy"
                  : "Confirm buy"}
            </button>
            <button
              type="button"
              className="badge"
              disabled={buying}
              style={{ cursor: buying ? "wait" : "pointer", background: "transparent" }}
              onClick={() => {
                setConfirmBuy(false);
                setBuyStep("idle");
                setMsg(null);
              }}
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
              if (d && !("error" in d)) {
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
            if (d && !("error" in d)) setMsg("Reported");
          })
        }
      >
        Report
      </button>
      {msg === "sign_in" ? (
        <span style={{ fontSize: "0.8rem" }}>
          <Link href="/sign-in">Sign in</Link> to collect
        </span>
      ) : msg === "already_sold" ? (
        <span style={{ color: "var(--ink-muted)", fontSize: "0.8rem" }}>
          Already sold
        </span>
      ) : msg ? (
        <span style={{ color: "var(--ink-muted)", fontSize: "0.8rem" }}>{msg}</span>
      ) : null}
    </div>
  );
}
