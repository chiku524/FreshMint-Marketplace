"use client";

import {
  PLATFORM_FEE_PERCENT,
  splitSaleProceeds,
} from "@/lib/fees/platform";
import type { Chain } from "@/lib/discovery/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
      const data = await post("/api/purchase", {
        listingId,
        amountUsd: amount,
      });
      if (!data || "error" in data) {
        if (data && data.error === "already_sold") {
          setJustSold(true);
          setConfirmBuy(false);
        }
        return;
      }
      finishPurchase(data, "Collected on FreshMint");
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
              Settles on FreshMint — withdraw to a {chain} wallet later if you
              want it on-chain. {PLATFORM_FEE_PERCENT.total}% treasury fee
              funds community updates. Seller receives $
              {feePreview.sellerNetUsd.toFixed(2)}; treasury $
              {feePreview.feeTreasuryUsd.toFixed(2)}.
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
