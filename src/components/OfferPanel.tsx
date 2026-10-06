"use client";

import { PlatformFeeBreakdown } from "@/components/PlatformFeeBreakdown";
import { resolveBuyAuthCta } from "@/lib/marketplace/buy-auth-cta";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Offer = {
  id: string;
  listingId: string;
  offererId: string;
  amountUsd: number;
  status: "open" | "accepted" | "cancelled" | "expired";
  createdAt: number;
};

export function OfferPanel({
  listingId,
  listPriceUsd,
  isSeller,
  sessionUserId,
  embedded = false,
}: {
  listingId: string;
  listPriceUsd?: number | null;
  isSeller: boolean;
  sessionUserId?: string | null;
  /** When true, omit page heading (dialog provides the title). */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [amount, setAmount] = useState(
    listPriceUsd && listPriceUsd > 0
      ? String(Math.max(1, Math.round(listPriceUsd * 0.85)))
      : "",
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const auth = resolveBuyAuthCta(sessionUserId);
  const signInHref = `/sign-in?next=${encodeURIComponent(`/listings/${listingId}`)}`;

  async function refresh() {
    const res = await fetch(`/api/listings/${listingId}/offers`, {
      credentials: "include",
    });
    const data = (await res.json()) as { offers?: Offer[] };
    setOffers(data.offers ?? []);
  }

  useEffect(() => {
    void refresh();
  }, [listingId]);

  async function submitOffer(e: React.FormEvent) {
    e.preventDefault();
    const amountUsd = Number(amount);
    if (!(amountUsd > 0)) {
      setMsg("Enter a positive USD offer");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/listings/${listingId}/offers`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "offer_failed");
      setMsg("Offer submitted");
      await refresh();
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "offer_failed");
    } finally {
      setBusy(false);
    }
  }

  async function accept(offerId: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/offers/${offerId}/accept`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "accept_failed");
      setMsg("Offer accepted — buyer can complete payment");
      await refresh();
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "accept_failed");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(offerId: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/offers/${offerId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "cancel_failed");
      setMsg("Offer cancelled");
      await refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "cancel_failed");
    } finally {
      setBusy(false);
    }
  }

  const openOffers = offers.filter((o) => o.status === "open");

  return (
    <div
      className={
        embedded
          ? "listing-offer-panel listing-offer-panel--embedded"
          : "fm-listing-form"
      }
      style={embedded ? undefined : { marginTop: "0.85rem" }}
    >
      {embedded ? null : (
        <h3
          className="display"
          style={{ margin: "0 0 0.35rem", fontSize: "1.05rem" }}
        >
          Offers
        </h3>
      )}
      <p className="fm-form-note" style={{ margin: "0 0 0.65rem" }}>
        Make an offer below the list price. Sellers can accept; the buyer then
        pays in crypto through FreshMint (0.5% treasury fee from the offer
        amount).
      </p>

      {!isSeller ? (
        auth === "sign_in" ? (
          <p className="fm-form-note">
            <Link href={signInHref}>Sign in</Link> to make an offer.
          </p>
        ) : auth === "ready" ? (
          <form
            onSubmit={(e) => void submitOffer(e)}
            className="fm-form-stack"
            style={{ maxWidth: "16rem", marginBottom: "0.75rem" }}
          >
            <label>
              Your offer (USD)
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                className="fm-field"
                required
              />
            </label>
            <PlatformFeeBreakdown
              priceUsd={Number(amount) > 0 ? Number(amount) : null}
              compact
            />
            <button
              type="submit"
              className="fm-btn fm-btn--primary"
              disabled={busy}
            >
              {busy ? "Sending…" : "Make offer"}
            </button>
          </form>
        ) : (
          <p className="fm-form-note">Checking sign-in…</p>
        )
      ) : null}

      {openOffers.length === 0 ? (
        <p className="fm-form-note" style={{ margin: 0 }}>
          No open offers yet.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {openOffers.map((o) => (
            <li
              key={o.id}
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                alignItems: "center",
                marginBottom: "0.45rem",
              }}
            >
              <strong>${o.amountUsd}</strong>
              <span className="fm-form-note" style={{ margin: 0 }}>
                from {o.offererId.slice(0, 8)}…
              </span>
              {isSeller ? (
                <button
                  type="button"
                  className="fm-btn fm-btn--primary"
                  disabled={busy}
                  onClick={() => void accept(o.id)}
                >
                  Accept
                </button>
              ) : null}
              {sessionUserId === o.offererId ? (
                <button
                  type="button"
                  className="fm-btn fm-btn--ghost"
                  disabled={busy}
                  onClick={() => void cancel(o.id)}
                >
                  Cancel
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {msg ? (
        <p className="fm-form-note" style={{ marginTop: "0.4rem" }}>
          {msg}
        </p>
      ) : null}
    </div>
  );
}
