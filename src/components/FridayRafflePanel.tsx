"use client";

import { TREASURY_FRIDAY_COPY } from "@/lib/marketplace/friday-treasury-copy";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type RaffleRow = {
  id: string;
  windowId: string;
  status: string;
  listingId: string | null;
  winnerUserId: string | null;
  eligibleCount: number;
  prizeStatus: string;
  claimAddress: string | null;
  reason: string;
};

type MeState = {
  eligibleThisWeek: boolean;
  kinds: string[];
  wins: RaffleRow[];
  latest: RaffleRow | null;
} | null;

export function FridayRafflePanel({
  surface = "me",
  wallets = [],
}: {
  surface?: "me" | "studio";
  /** Linked wallet addresses the signed-in user can claim to. */
  wallets?: Array<{ chain: string; address: string }>;
}) {
  const [history, setHistory] = useState<RaffleRow[]>([]);
  const [me, setMe] = useState<MeState>(null);
  const [eligibility, setEligibility] = useState(TREASURY_FRIDAY_COPY.eligibility);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void fetch("/api/treasury/friday-raffle", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.ok) return;
        setHistory(d.history ?? []);
        setMe(d.me ?? null);
        if (typeof d.copy === "string") setEligibility(d.copy);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function claim(windowId: string) {
    setMsg(null);
    const address = wallets[0]?.address;
    if (!address) {
      setMsg("Link a wallet in Settings first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/treasury/friday-raffle/claim", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windowId, claimAddress: address }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMsg(data.error ?? "claim_failed");
        return;
      }
      setMsg("Claim recorded — transfer follows when escrow can send on-chain.");
      load();
    } finally {
      setBusy(false);
    }
  }

  const lead =
    surface === "studio"
      ? TREASURY_FRIDAY_COPY.studio
      : TREASURY_FRIDAY_COPY.me;

  const myWins = me?.wins ?? [];
  const latest = me?.latest ?? history[0] ?? null;

  return (
    <section
      id="friday-raffle"
      className="me-section"
      data-testid="friday-raffle-panel"
    >
      <h2 className="display me-section__title">Friday treasury raffle</h2>
      <p className="me-section__lead">{lead}</p>
      <p className="fm-form-note" style={{ marginBottom: "0.75rem" }}>
        {eligibility}{" "}
        <Link href="/docs#friday">How it works</Link>
      </p>

      {me ? (
        <p className="fm-form-note" style={{ marginBottom: "0.75rem" }}>
          This week:{" "}
          {me.eligibleThisWeek
            ? `entered (${me.kinds.join(", ") || "active"})`
            : "not entered yet — mint, list, buy, offer, or bid before Friday UTC"}
          .
        </p>
      ) : surface === "me" ? null : (
        <p className="fm-form-note" style={{ marginBottom: "0.75rem" }}>
          <Link href="/sign-in?next=/studio">Sign in</Link> to see your entry
          status.
        </p>
      )}

      {latest ? (
        <p className="fm-form-note" style={{ marginBottom: "0.75rem" }}>
          Latest window {latest.windowId}: {latest.status}
          {latest.eligibleCount > 0 ? ` · ${latest.eligibleCount} eligible` : ""}
          {latest.listingId ? (
            <>
              {" · "}
              <Link href={`/listings/${latest.listingId}`}>bought work</Link>
            </>
          ) : null}
          {latest.prizeStatus !== "n/a" ? ` · prize ${latest.prizeStatus}` : ""}
        </p>
      ) : (
        <p className="fm-empty-copy">
          No Friday raffle yet — runs when treasury fees fund the weekly buy.
        </p>
      )}

      {myWins.length > 0 ? (
        <ul className="me-list">
          {myWins.map((w) => (
            <li key={w.id} className="me-list__row">
              {w.windowId}
              {w.listingId ? (
                <>
                  {" · "}
                  <Link href={`/listings/${w.listingId}`}>listing</Link>
                </>
              ) : null}
              {" · "}
              {w.prizeStatus}
              {w.prizeStatus === "pending_claim" ||
              w.prizeStatus === "assigned" ? (
                <>
                  {" · "}
                  <button
                    type="button"
                    className="badge"
                    disabled={busy}
                    onClick={() => void claim(w.windowId)}
                  >
                    Claim
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {history.length > 1 ? (
        <details style={{ marginTop: "0.75rem" }}>
          <summary className="fm-form-note">Recent Fridays</summary>
          <ul className="me-list" style={{ marginTop: "0.5rem" }}>
            {history.slice(0, 6).map((r) => (
              <li key={r.id} className="me-list__row">
                {r.windowId} · {r.status}
                {r.listingId ? (
                  <>
                    {" · "}
                    <Link href={`/listings/${r.listingId}`}>work</Link>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {msg ? (
        <p className="fm-form-note" style={{ marginTop: "0.5rem" }}>
          {msg}
        </p>
      ) : null}
    </section>
  );
}
