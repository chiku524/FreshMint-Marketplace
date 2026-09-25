"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  humanizeCheckoutError,
  resolveBuyAuthCta,
} from "@/lib/marketplace/buy-auth-cta";

type Bid = {
  id: string;
  bidderId: string;
  amountUsd: number;
  createdAt: number;
};

type SettleInfo = {
  label:
    | "open"
    | "claim_pending"
    | "awarded"
    | "unsold"
    | "awaiting_payment"
    | "cascaded"
    | "payment_expired_unsold";
  outcome?: {
    status: string;
    reason?: string;
    amountUsd?: number;
    highBidderId?: string;
  };
  purchaseId?: string | null;
  purchaseStatus?: string | null;
  paymentDeadlineAt?: number | null;
  cascaded?: boolean;
  expiredWinnerId?: string | null;
};

function formatCountdown(ms: number): string {
  if (ms <= 0) return "expired";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h >= 48) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function BidPanel({
  listingId,
  minBidUsd,
  live,
  ended,
  isHighBidder,
  winningBidUsd,
  reserveMet,
  claimPurchaseId,
  isCreator = false,
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
  isCreator?: boolean;
}) {
  const router = useRouter();
  const [bids, setBids] = useState<Bid[]>([]);
  const [settle, setSettle] = useState<SettleInfo | null>(null);
  const [amount, setAmount] = useState(String(minBidUsd));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<
    string | null | undefined
  >(undefined);
  const [nowTick, setNowTick] = useState(() => Date.now());

  function load() {
    void fetch(`/api/listings/${listingId}/bids`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { bids: [] }))
      .then((d: { bids?: Bid[]; settle?: SettleInfo }) => {
        setBids(d.bids ?? []);
        if (d.settle) setSettle(d.settle);
      })
      .catch(() => setBids([]));
  }

  useEffect(() => {
    load();
    const t = window.setInterval(load, 12_000);
    return () => window.clearInterval(t);
  }, [listingId]);

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

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 1_000);
    return () => window.clearInterval(t);
  }, []);

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
      setError(
        humanizeCheckoutError(
          err instanceof Error ? err.message : "bid_failed",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  const label = settle?.label;
  const unsold =
    ended &&
    (label === "unsold" ||
      label === "payment_expired_unsold" ||
      (!reserveMet && (winningBidUsd == null || !reserveMet)));
  const awardedOrClaim =
    ended &&
    reserveMet &&
    (label === "claim_pending" ||
      label === "awaiting_payment" ||
      label === "cascaded" ||
      label === "awarded" ||
      Boolean(reserveMet && winningBidUsd));
  const purchaseId = claimPurchaseId ?? settle?.purchaseId ?? null;
  const deadlineAt = settle?.paymentDeadlineAt ?? null;
  const remainingMs =
    deadlineAt != null ? Math.max(0, deadlineAt - nowTick) : null;
  const deadlineLabel = useMemo(() => {
    if (remainingMs == null) return null;
    return formatCountdown(remainingMs);
  }, [remainingMs]);

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
              disabled={busy || resolveBuyAuthCta(sessionUserId) !== "ready"}
              style={{
                background: "var(--bg)",
                border: "1px solid var(--line)",
                color: "var(--ink)",
                padding: "0.45rem 0.6rem",
                width: "8rem",
              }}
            />
            {resolveBuyAuthCta(sessionUserId) === "checking" ? (
              <button
                type="button"
                className="badge featured"
                disabled
                style={{ cursor: "wait", background: "transparent" }}
              >
                Checking sign-in…
              </button>
            ) : resolveBuyAuthCta(sessionUserId) === "sign_in" ? (
              <Link href={`/sign-in?next=/listings/${listingId}`} className="badge featured">
                Sign in to continue
              </Link>
            ) : (
              <button
                type="button"
                className="badge featured"
                disabled={busy}
                style={{ cursor: busy ? "wait" : "pointer", background: "transparent" }}
                onClick={() => void onBid()}
              >
                {busy ? "Placing bid…" : "Place bid"}
              </button>
            )}
          </div>
        </>
      ) : ended ? (
        <div style={{ margin: "0 0 0.65rem" }}>
          {unsold ? (
            <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>
              {label === "payment_expired_unsold"
                ? "English auction ended · winner payment window expired with no eligible runner-up. "
                : "English auction ended · reserve not met. "}
              {isCreator
                ? "Use the sale mode editor below to relist or switch modes."
                : "Creator can relist or switch sale mode."}
            </p>
          ) : isCreator &&
            (label === "awaiting_payment" ||
              label === "claim_pending" ||
              label === "cascaded") ? (
            <>
              <p
                style={{
                  margin: "0 0 0.35rem",
                  color: "var(--ink)",
                  fontSize: "0.95rem",
                  fontWeight: 600,
                }}
              >
                {label === "cascaded"
                  ? "Passed to runner-up — awaiting payment"
                  : "Awaiting winner payment"}
                {winningBidUsd != null ? ` ($${winningBidUsd})` : ""}.
              </p>
              <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.85rem" }}>
                {deadlineLabel && deadlineLabel !== "expired"
                  ? `Winner has ${deadlineLabel} left to complete checkout.`
                  : deadlineLabel === "expired"
                    ? "Payment deadline just expired — refresh for cascade or unsold."
                    : "Winner must complete crypto checkout within 48 hours."}
              </p>
            </>
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
                {settle?.cascaded
                  ? "You’re next — complete payment"
                  : "You won — complete payment"}
                {winningBidUsd != null ? ` ($${winningBidUsd})` : ""}.
              </p>
              <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.85rem" }}>
                {deadlineLabel && deadlineLabel !== "expired" ? (
                  <>
                    Pay within <strong>{deadlineLabel}</strong> or the award
                    passes to the next bidder who met reserve.
                  </>
                ) : deadlineLabel === "expired" ? (
                  <>Payment deadline expired — refreshing may pass the award.</>
                ) : (
                  <>You have 48 hours to complete payment.</>
                )}{" "}
                {purchaseId
                  ? "A checkout at the winning bid is ready — use Resume / Continue buy below (wallet required for crypto)."
                  : "Use Buy / Continue below at the winning bid (wallet required for crypto)."}
              </p>
            </>
          ) : awardedOrClaim ? (
            <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>
              English auction ended ·{" "}
              {label === "cascaded"
                ? "passed to runner-up"
                : "sold to high bidder"}
              {winningBidUsd != null ? ` at $${winningBidUsd}` : ""}.
            </p>
          ) : (
            <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>
              English auction ended. Winning bid ${winningBidUsd ?? "—"}.
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
