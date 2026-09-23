"use client";

import {
  FEATURED_BOOST_USD,
  describeFeaturedBoost,
} from "@/lib/fees/featured-boost";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function FeaturedBoostButton({
  listingId,
  alreadyBoosted = false,
}: {
  listingId: string;
  alreadyBoosted?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (alreadyBoosted) {
    return (
      <p
        style={{
          margin: "0.75rem 0 0",
          fontSize: "0.85rem",
          color: "var(--accent-soft)",
        }}
      >
        Featured boost active — shown in the Promoted section on{" "}
        <Link href="/featured">/featured</Link>. Rising scoring is unchanged.
      </p>
    );
  }

  async function boost() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/listings/${listingId}/boost`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(
          data.error === "publish_first"
            ? "Soft-launch or publish before boosting"
            : data.error === "already_boosted"
              ? "Already boosted"
              : data.error === "unauthorized"
                ? "Sign in to request a boost"
                : data.error || "boost_failed",
        );
        return;
      }
      setMsg(
        `Boost requested · $${FEATURED_BOOST_USD} promotional fee to treasury (settlement coming online)`,
      );
      router.refresh();
    } catch {
      setMsg("boost_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: "0.85rem" }}>
      <button
        type="button"
        className="badge featured"
        disabled={busy}
        style={{
          cursor: busy ? "wait" : "pointer",
          background: "transparent",
        }}
        onClick={() => void boost()}
        title={describeFeaturedBoost()}
      >
        {busy ? "Requesting…" : `Boost to Featured · $${FEATURED_BOOST_USD}`}
      </button>
      <p
        style={{
          margin: "0.4rem 0 0",
          fontSize: "0.78rem",
          color: "var(--ink-muted)",
          maxWidth: "42ch",
          lineHeight: 1.45,
        }}
      >
        Optional paid promotional placement in Featured only. Separate from
        Rising (free fairness quota). Payment settlement: pay $
        {FEATURED_BOOST_USD} USD to the platform treasury wallet — rails coming
        online.
      </p>
      {msg ? (
        <p
          style={{
            margin: "0.35rem 0 0",
            fontSize: "0.8rem",
            color: "var(--emergent)",
          }}
        >
          {msg}
        </p>
      ) : null}
    </div>
  );
}
