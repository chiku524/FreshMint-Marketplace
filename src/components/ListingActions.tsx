"use client";

import {
  PLATFORM_FEE_PERCENT,
  splitSaleProceeds,
} from "@/lib/fees/platform";
import type { Chain } from "@/lib/discovery/types";
import { quoteNativeFromUsd } from "@/lib/onchain/fx";
import {
  browserWalletAvailable,
  maybeSendWalletTx,
  requestBuyerAddress,
} from "@/lib/onchain/wallet-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

async function confirmTx(
  listingId: string,
  action: "mint" | "buy",
  txHash: string,
) {
  await fetch("/api/onchain/confirm", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId, action, txHash }),
  });
}

const CHAIN_WALLET_LABEL: Record<Chain, string> = {
  evm: "EVM",
  solana: "Solana",
  boing: "Boing",
};

export function ListingActions({
  listingId,
  creatorId,
  priceUsd,
  stage,
  sold = false,
  listingType,
  chain = "evm",
}: {
  listingId: string;
  creatorId?: string;
  priceUsd: number | null;
  stage: string;
  sold?: boolean;
  listingType?: string;
  chain?: Chain;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmBuy, setConfirmBuy] = useState(false);
  const [buying, setBuying] = useState(false);
  const [justSold, setJustSold] = useState(false);
  const feePreview =
    priceUsd != null && priceUsd > 0 ? splitSaleProceeds(priceUsd) : null;
  const nativeQuote =
    priceUsd != null && priceUsd > 0 ? quoteNativeFromUsd(priceUsd, chain) : null;
  const uniqueSold = sold || justSold;
  const canBuy = priceUsd != null && !uniqueSold;

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
            : raw === "unavailable"
              ? "This work isn't available to buy"
              : raw === "wash_blocked" || raw === "high_velocity_low_dwell"
                ? "Purchase blocked"
                : raw === "invalid_body"
                  ? "Couldn't start this purchase. Try again."
                  : raw === "wallet_required"
                    ? `Connect a ${CHAIN_WALLET_LABEL[chain]} wallet to buy this on-chain`
                    : raw;
      setMsg(error);
      return { error };
    }
    return data as Record<string, unknown>;
  }

  async function completePurchase() {
    const amount = Number(priceUsd);
    if (!Number.isFinite(amount) || amount <= 0 || buying) return;
    setBuying(true);
    try {
      let buyerAddress: string | null = null;
      if (browserWalletAvailable(chain)) {
        try {
          buyerAddress = await requestBuyerAddress(chain);
        } catch (e) {
          setMsg(
            e instanceof Error
              ? e.message
              : `Connect a ${CHAIN_WALLET_LABEL[chain]} wallet to buy`,
          );
          return;
        }
        if (!buyerAddress) {
          setMsg(
            `Connect a ${CHAIN_WALLET_LABEL[chain]} wallet to receive this NFT on-chain`,
          );
          return;
        }
      }

      if (buyerAddress) {
        const prep = await post("/api/onchain/prepare", {
          listingId,
          action: "buy",
          amountUsd: amount,
          buyerAddress,
        });
        if (!prep || "error" in prep) return;
        const preparedTx =
          prep.walletTx ??
          (prep.intent &&
          typeof prep.intent === "object" &&
          prep.intent !== null &&
          "walletTx" in prep.intent
            ? (prep.intent as { walletTx: unknown }).walletTx
            : undefined);
        try {
          const hash = await maybeSendWalletTx({
            walletTx: preparedTx,
            listingId,
            action: "buy",
            amountUsd: amount,
          });
          if (hash) {
            const data = await post("/api/purchase", {
              listingId,
              amountUsd: amount,
              txHash: hash,
              buyerAddress,
            });
            if (!data || "error" in data) {
              if (data && data.error === "already_sold") {
                setJustSold(true);
                setConfirmBuy(false);
              }
              return;
            }
            await confirmTx(listingId, "buy", hash);
            finishPurchase(
              data,
              `On-chain buy · ${hash.slice(0, 14)}…`,
            );
            return;
          }
        } catch (e) {
          setMsg(
            e instanceof Error ? e.message : "Wallet rejected the buy",
          );
          return;
        }
      }

      const data = await post("/api/purchase", {
        listingId,
        amountUsd: amount,
        buyerAddress: buyerAddress ?? undefined,
      });
      if (!data || "error" in data) {
        if (data && data.error === "already_sold") {
          setJustSold(true);
          setConfirmBuy(false);
        }
        return;
      }
      let note = `Collected · ${String(data.txHash).slice(0, 14)}…`;
      if (!buyerAddress) {
        note += ` · connect a ${CHAIN_WALLET_LABEL[chain]} wallet to receive the NFT on-chain`;
      } else if (data.walletTx) {
        try {
          const hash = await maybeSendWalletTx({
            walletTx: data.walletTx,
            listingId,
            action: "buy",
            amountUsd: amount,
          });
          if (hash) {
            await confirmTx(listingId, "buy", hash);
            note = `On-chain buy · ${hash.slice(0, 14)}…`;
          }
        } catch (e) {
          note += ` · on-chain skipped: ${e instanceof Error ? e.message : "wallet"}`;
        }
      }
      finishPurchase(data, note);
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
    if (listingType !== "open_edition") setJustSold(true);
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
      {canBuy && !confirmBuy ? (
        <button
          type="button"
          className="badge featured"
          style={{ cursor: "pointer", background: "transparent" }}
          onClick={() => {
            setMsg(null);
            setConfirmBuy(true);
          }}
        >
          Buy ${priceUsd}
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
            Confirm purchase · ${priceUsd}
            {nativeQuote ? ` · ${nativeQuote.formatted}` : ""}
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
              Wallet pays {nativeQuote?.formatted ?? "the listed price"} at $
              {nativeQuote?.usdPerNative.toLocaleString()}/{nativeQuote?.symbol}{" "}
              so it matches ${priceUsd}. {PLATFORM_FEE_PERCENT.total}% platform
              fee ({PLATFORM_FEE_PERCENT.treasury}% treasury ·{" "}
              {PLATFORM_FEE_PERCENT.operator}% operator). Seller receives $
              {feePreview.sellerNetUsd.toFixed(2)}; marketplace $
              {feePreview.feeTreasuryUsd.toFixed(2)}; operator $
              {feePreview.feeOperatorUsd.toFixed(2)}.
            </p>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            <button
              type="button"
              className="badge featured"
              disabled={buying}
              style={{ cursor: buying ? "wait" : "pointer", background: "transparent" }}
              onClick={() => void completePurchase()}
            >
              {buying ? "Buying…" : "Confirm buy"}
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
          void post("/api/report", { listingId, reason: "spam" }).then((d) => {
            if (d) {
              setMsg("Reported");
              router.refresh();
            }
          })
        }
      >
        Report
      </button>
      {msg === "sign_in" ? (
        <span style={{ color: "var(--ink-muted)", fontSize: "0.8rem" }}>
          <Link href={`/sign-in?next=/listings/${listingId}`}>Sign in</Link> to
          buy
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
