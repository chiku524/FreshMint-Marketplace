"use client";

import { useSingleFlight } from "@/lib/client/single-flight";
import { PlatformFeeBreakdown } from "@/components/PlatformFeeBreakdown";
import { useRouter } from "next/navigation";
import { useState } from "react";

const RESALE_ERRORS: Record<string, string> = {
  resale_failed: "Couldn't list it right now. Please try again.",
  unauthorized: "Your session expired. Sign in again to list this piece.",
  already_listed: "This piece is already listed for resale.",
};

function friendlyResaleError(code: string): string {
  return RESALE_ERRORS[code] ?? code.replace(/_/g, " ");
}

export function ResaleListButton({
  purchaseId,
  defaultPriceUsd,
}: {
  purchaseId: string;
  defaultPriceUsd?: number | null;
}) {
  const router = useRouter();
  const guard = useSingleFlight();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(
    defaultPriceUsd && defaultPriceUsd > 0 ? String(defaultPriceUsd) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const priceUsd = Number(price);
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
      setError("Enter a positive USD price");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/listings/resale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseId, priceUsd }),
      });
      const data = (await res.json()) as { error?: string; href?: string };
      if (!res.ok) throw new Error(data.error ?? "resale_failed");
      setOpen(false);
      router.push(data.href ?? "/open");
      router.refresh();
    } catch (err) {
      setError(friendlyResaleError(err instanceof Error ? err.message : "resale_failed"));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="fm-btn fm-btn--primary"
        onClick={() => setOpen(true)}
      >
        Resell this piece
      </button>
    );
  }

  return (
    <form onSubmit={(e) => {
        e.preventDefault();
        void guard(() => submit(e));
      }} className="fm-form-stack" style={{ maxWidth: "22rem" }}>
      <label>
        Your price (USD)
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          required
          autoFocus
          className="fm-field"
        />
        {defaultPriceUsd && defaultPriceUsd > 0 ? (
          <span className="fm-form-note">You paid ${defaultPriceUsd}.</span>
        ) : null}
      </label>
      <div className="fm-form-actions">
        <button type="submit" disabled={busy} className="fm-btn fm-btn--primary">
          {busy ? "Listing…" : "List for sale"}
        </button>
        <button
          type="button"
          className="fm-btn fm-btn--ghost"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p role="alert" style={{ margin: 0, color: "var(--danger)", fontSize: "0.85rem" }}>{error}</p>
      ) : null}
      <PlatformFeeBreakdown
        priceUsd={Number(price) > 0 ? Number(price) : defaultPriceUsd}
        compact
        isSecondary
      />
    </form>
  );
}
