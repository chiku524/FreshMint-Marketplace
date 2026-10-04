"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SaleMode = "fixed" | "timed_window" | "english";

export function SaleModeEditor({
  listingId,
  saleMode,
  startingBidUsd,
  reserveUsd,
}: {
  listingId: string;
  saleMode: SaleMode | string;
  startingBidUsd?: number | null;
  reserveUsd?: number | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<SaleMode>(
    saleMode === "english" || saleMode === "timed_window" || saleMode === "fixed"
      ? saleMode
      : "fixed",
  );
  const [startBid, setStartBid] = useState(String(startingBidUsd ?? ""));
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
    <div className="fm-listing-form">
      <h3 className="display" style={{ margin: "0 0 0.45rem", fontSize: "1.05rem" }}>
        Sale mode
      </h3>
      <div className="fm-form-actions" style={{ marginBottom: "0.6rem" }}>
        {(
          [
            ["fixed", "Fixed price"],
            ["timed_window", "Timed window (buy at list price)"],
            ["english", "English auction (open bidding)"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={mode === id ? "fm-btn fm-btn--primary" : "fm-btn fm-btn--ghost"}
            onClick={() => setMode(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "english" ? (
        <div className="fm-form-stack" style={{ maxWidth: "16rem" }}>
          <label>
            Starting bid (USD)
            <input
              value={startBid}
              onChange={(e) => setStartBid(e.target.value)}
              className="fm-field"
            />
          </label>
          <label>
            Reserve (USD, optional)
            <input
              value={reserve}
              onChange={(e) => setReserve(e.target.value)}
              className="fm-field"
            />
          </label>
        </div>
      ) : null}
      <div className="fm-form-actions" style={{ marginTop: "0.6rem" }}>
        <button
          type="button"
          className="fm-btn fm-btn--primary"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Update sale mode"}
        </button>
      </div>
      {msg ? <p className="fm-form-note" style={{ marginTop: "0.4rem" }}>{msg}</p> : null}
    </div>
  );
}
