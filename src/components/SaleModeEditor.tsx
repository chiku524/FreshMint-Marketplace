"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SaleMode } from "@/lib/marketplace/sale-mode";
import { SALE_MODE_LABELS } from "@/lib/marketplace/sale-mode";

const MODES: SaleMode[] = ["fixed", "timed_window", "english", "dutch"];

export function SaleModeEditor({
  listingId,
  saleMode,
  startingBidUsd,
  reserveUsd,
  priceUsd,
}: {
  listingId: string;
  saleMode: SaleMode | string;
  startingBidUsd?: number | null;
  reserveUsd?: number | null;
  priceUsd?: number | null;
}) {
  const router = useRouter();
  const initial: SaleMode =
    saleMode === "english" ||
    saleMode === "timed_window" ||
    saleMode === "dutch" ||
    saleMode === "fixed"
      ? saleMode
      : "fixed";
  const [open, setOpen] = useState(initial !== "fixed");
  const [mode, setMode] = useState<SaleMode>(initial);
  const [startBid, setStartBid] = useState(
    String(startingBidUsd ?? priceUsd ?? ""),
  );
  const [reserve, setReserve] = useState(String(reserveUsd ?? ""));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/listings/${listingId}/sale-mode`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleMode: mode,
          startingBidUsd: startBid ? Number(startBid) : null,
          reserveUsd: reserve ? Number(reserve) : null,
          priceUsd:
            mode === "dutch" && startBid
              ? Number(startBid)
              : mode === "fixed" && startBid
                ? Number(startBid)
                : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "save_failed");
      setMsg("Saved");
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "save_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fm-listing-form" style={{ marginTop: "0.75rem" }}>
      <button
        type="button"
        className="fm-btn fm-btn--ghost"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ marginBottom: open ? "0.55rem" : 0 }}
      >
        {open ? "Hide advanced selling" : "Advanced: change how it’s sold"}
      </button>
      {!open ? (
        <p className="fm-form-note" style={{ margin: "0.35rem 0 0" }}>
          Current: {SALE_MODE_LABELS[initial] ?? "Buy now"}
        </p>
      ) : null}
      {open ? (
        <>
          <h3
            className="display"
            style={{ margin: "0 0 0.35rem", fontSize: "1.05rem" }}
          >
            How it’s sold
          </h3>
          <p className="fm-form-note" style={{ margin: "0 0 0.55rem" }}>
            Default is Buy now. English and Dutch auctions are advanced options.
          </p>
          <div className="fm-form-actions" style={{ marginBottom: "0.6rem" }}>
            {MODES.map((id) => (
              <button
                key={id}
                type="button"
                className={
                  mode === id ? "fm-btn fm-btn--primary" : "fm-btn fm-btn--ghost"
                }
                onClick={() => setMode(id)}
              >
                {SALE_MODE_LABELS[id]}
              </button>
            ))}
          </div>
          {mode === "english" || mode === "dutch" ? (
            <div className="fm-form-stack" style={{ maxWidth: "16rem" }}>
              <label>
                {mode === "dutch" ? "Starting price (USD)" : "Starting bid (USD)"}
                <input
                  value={startBid}
                  onChange={(e) => setStartBid(e.target.value)}
                  className="fm-field"
                />
              </label>
              <label>
                {mode === "dutch"
                  ? "Floor price (USD)"
                  : "Reserve (USD, optional)"}
                <input
                  value={reserve}
                  onChange={(e) => setReserve(e.target.value)}
                  className="fm-field"
                />
              </label>
            </div>
          ) : null}
          {mode === "timed_window" ? (
            <p className="fm-form-note">
              Buyers pay the list price while the schedule window is open.
            </p>
          ) : null}
          <div className="fm-form-actions" style={{ marginTop: "0.6rem" }}>
            <button
              type="button"
              className="fm-btn fm-btn--primary"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save selling options"}
            </button>
          </div>
          {msg ? (
            <p className="fm-form-note" style={{ marginTop: "0.4rem" }}>
              {msg}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
