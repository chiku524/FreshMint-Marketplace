"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Bid = {
  id: string;
  bidderId: string;
  amountUsd: number;
  createdAt: number;
};

type SettleInfo = {
  label: "open" | "claim_pending" | "awarded" | "unsold";
  outcome?: {
    status: string;
    reason?: string;
    amountUsd?: number;
    highBidderId?: string;
  };
  purchaseId?: string | null;
  purchaseStatus?: string | null;
};

export function BidPanel({
  listingId,
  minBidUsd,
  live,
  ended,
  isHighBidder,
  winningBidUsd,
  reserveMet,
  claimPurchaseId,
}: {
  listingId: string;
  minBidUsd: number;
  live: boolean;
  ended: boolean;
  isHighBidder?: boolean;
  winningBidUsd?: number | null;
  reserveMet?: boolean;
  /** Server-side lazy-settle purchase id when viewer is the winner. */
  claimPurchaseId?: string | null;
}) {
  const router = useRouter();
  const [bids, setBids] = useState<Bid[]>([]);
  const [settle, setSettle] = useState<SettleInfo | null>(null);
  const [amount, setAmount] = useState(String(minBidUsd));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    void fetch(`/api/listings/${listingId}/bids`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { bids: [] }))
      .then(
        (d: { bids?: Bid[]; settle?: SettleInfo }) => {
          setBids(d.bids ?? []);
          if (d.settle) setSettle(d.settle);
        },
      )
      .catch(() => setBids([]));
  }

  useEffect(() => {
    load();
    const t = window.setInterval(load, 12_000);
    return () => window.clearInterval(t);
  }, [listingId]);

  async function onBid() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/listings/${listingId}/bids`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd: Number(amount) }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "bid_failed");
      }
      load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "bid_failed");
    } finally {
      setBusy(false);
    }
  }

  const label = settle?.label;
  const unsold =
    ended &&
    (label === "unsold" ||
      (!reserveMet && (winningBidUsd == null || !reserveMet)));
  const awardedOrClaim =
    ended &&
    reserveMet &&
    (label === "claim_pending" ||
      label === "awarded" ||
      Boolean(reserveMet && winningBidUsd));
  const purchaseId = claimPurchaseId ?? settle?.purchaseId ?? null;

  return (
    <div
      style={{
        marginTop: "1rem",
        border: "1px solid var(--line)",
        padding: "0.9rem 1rem",
        background: "var(--panel)",
      }}
    >
      <h3 className="display" style={{ margin: "0 0 0.5rem", fontSize: "1.15rem" }}>
        English auction
      </h3>
      {live ? (
        <>
          <p style={{ margin: "0 0 0.65rem", color: "var(--ink-muted)", fontSize: "0.9rem" }}>
            Open bidding in USD. Min next bid ${minBidUsd}.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              type="number"
              min={minBidUsd}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{
                background: "var(--bg)",
                border: "1px solid var(--line)",
                color: "var(--ink)",
                padding: "0.45rem 0.6rem",
                width: "8rem",
              }}
            />
            <button
              type="button"
              className="badge featured"
              disabled={busy}
              style={{ cursor: "pointer", background: "transparent" }}
              onClick={() => void onBid()}
            >
              {busy ? "Bidding…" : "Place bid"}
            </button>
          </div>
        </>
      ) : ended ? (
        <div style={{ margin: "0 0 0.65rem" }}>
          {unsold ? (
            <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>
              Auction ended · reserve not met. Creator can relist or switch sale mode.
            </p>
          ) : isHighBidder && awardedOrClaim ? (
            <>
              <p
                style={{
                  margin: "0 0 0.5rem",
                  color: "var(--ink)",
                  fontSize: "0.95rem",
                  fontWeight: 600,
                }}
              >
                You won — complete payment
                {winningBidUsd != null ? ` ($${winningBidUsd})` : ""}.
              </p>
              <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.85rem" }}>
                {purchaseId
                  ? "A checkout at the winning bid is ready — use Resume / Continue buy below (wallet required for crypto)."
                  : "Use Buy / Continue below at the winning bid (wallet required for crypto)."}
              </p>
            </>
          ) : awardedOrClaim ? (
            <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>
              Auction ended · sold to high bidder
              {winningBidUsd != null ? ` at $${winningBidUsd}` : ""}.
            </p>
          ) : (
            <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>
              Auction ended. Winning bid ${winningBidUsd ?? "—"}.
            </p>
          )}
        </div>
      ) : (
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>
          Bidding has not started yet.
        </p>
      )}
      {error ? (
        <p style={{ color: "crimson", margin: "0.5rem 0 0", fontSize: "0.85rem" }}>{error}</p>
      ) : null}
      {bids.length ? (
        <ul style={{ margin: "0.75rem 0 0", padding: 0, listStyle: "none" }}>
          {bids.slice(0, 8).map((b) => (
            <li
              key={b.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "0.5rem",
                fontSize: "0.85rem",
                borderTop: "1px solid var(--line)",
                padding: "0.35rem 0",
              }}
            >
              <span>${b.amountUsd}</span>
              <span style={{ color: "var(--ink-muted)" }}>
                {new Date(b.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
