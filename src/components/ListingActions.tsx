"use client";

import {
  PLATFORM_FEE_PERCENT,
  describePlatformFee,
  splitSaleProceeds,
} from "@/lib/fees/platform";
import { maybeSendWalletTx } from "@/lib/onchain/wallet-client";
import { useRouter } from "next/navigation";
import { useState } from "react";

async function confirmTx(
  listingId: string,
  action: "mint" | "buy",
  txHash: string,
) {
  await fetch("/api/onchain/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId, action, txHash }),
  });
}

export function ListingActions({
  listingId,
  creatorId,
  priceUsd,
  stage,
}: {
  listingId: string;
  creatorId?: string;
  priceUsd: number | null;
  stage: string;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const feePreview =
    priceUsd != null && priceUsd > 0 ? splitSaleProceeds(priceUsd) : null;

  async function post(url: string, body: Record<string, unknown>) {
    setMsg(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || data.errors?.join(", ") || "failed");
      return null;
    }
    return data as Record<string, unknown>;
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
      {priceUsd != null ? (
        <span
          style={{
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "0.2rem",
          }}
        >
          <button
            type="button"
            className="badge featured"
            style={{ cursor: "pointer", background: "transparent" }}
            onClick={() =>
              void (async () => {
                const data = await post("/api/purchase", {
                  listingId,
                  amountUsd: priceUsd,
                });
                if (!data) return;
                const feeNote =
                  data.fees &&
                  typeof data.fees === "object" &&
                  data.fees !== null &&
                  "sellerNetUsd" in data.fees
                    ? ` · seller $${Number((data.fees as { sellerNetUsd: number }).sellerNetUsd).toFixed(2)} after ${PLATFORM_FEE_PERCENT.total}% fee`
                    : "";
                let note = `Purchase · ${String(data.txHash).slice(0, 14)}…${feeNote}`;
                try {
                  const hash = await maybeSendWalletTx({
                    walletTx: data.walletTx,
                    listingId,
                    action: "buy",
                    amountUsd: priceUsd,
                  });
                  if (hash) {
                    await confirmTx(listingId, "buy", hash);
                    note = `On-chain buy · ${hash.slice(0, 14)}…${feeNote}`;
                  }
                } catch (e) {
                  note += ` · wallet: ${e instanceof Error ? e.message : "skipped"}`;
                }
                setMsg(note);
                router.refresh();
              })()
            }
          >
            Buy ${priceUsd}
          </button>
          <span style={{ color: "var(--ink-muted)", fontSize: "0.72rem" }}>
            {describePlatformFee(priceUsd)}
            {feePreview
              ? ` · treasury $${feePreview.feeTreasuryUsd.toFixed(2)} · operator $${feePreview.feeOperatorUsd.toFixed(2)}`
              : ""}
          </span>
        </span>
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
      {msg ? (
        <span style={{ color: "var(--ink-muted)", fontSize: "0.8rem" }}>{msg}</span>
      ) : null}
    </div>
  );
}
