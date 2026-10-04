"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ResaleListButton({
  purchaseId,
  defaultPriceUsd,
}: {
  purchaseId: string;
  defaultPriceUsd?: number | null;
}) {
  const router = useRouter();
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
      setError(err instanceof Error ? err.message : "resale_failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="badge"
        style={{ cursor: "pointer", background: "transparent" }}
        onClick={() => setOpen(true)}
      >
        List for resale
      </button>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="fm-form-stack" style={{ maxWidth: "16rem" }}>
      <label>
        Resale price (USD)
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          required
          className="fm-field"
        />
      </label>
      <div className="fm-form-actions">
        <button type="submit" disabled={busy} className="fm-btn fm-btn--primary">
          {busy ? "Listing…" : "Publish secondary"}
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
        <p style={{ margin: 0, color: "var(--danger)", fontSize: "0.85rem" }}>{error}</p>
      ) : (
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.8rem" }}>
          Fixed-price secondary. Platform 0.5% + creator royalty (default 5%) come from the listed
          price.
        </p>
      )}
    </form>
  );
}
