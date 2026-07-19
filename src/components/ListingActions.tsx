"use client";

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
              let note = `Purchase · ${String(data.txHash).slice(0, 14)}…`;
              try {
                const hash = await maybeSendWalletTx({
                  walletTx: data.walletTx,
                  listingId,
                  action: "buy",
                  amountUsd: priceUsd,
                });
                if (hash) {
                  await confirmTx(listingId, "buy", hash);
                  note = `On-chain buy · ${hash.slice(0, 14)}…`;
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
