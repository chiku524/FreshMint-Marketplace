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
    <form onSubmit={(e) => void submit(e)} style={{ display: "grid", gap: "0.4rem" }}>
      <label style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>
        Resale price (USD)
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          required
          style={{
            display: "block",
            width: "100%",
            marginTop: "0.25rem",
            background: "var(--panel)",
            border: "1px solid var(--line)",
            color: "var(--ink)",
            padding: "0.4rem 0.55rem",
          }}
        />
      </label>
      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
        <button
          type="submit"
          disabled={busy}
          className="badge featured"
          style={{ cursor: "pointer", background: "transparent" }}
        >
          {busy ? "Listing…" : "Publish secondary"}
        </button>
        <button
          type="button"
          className="badge"
          style={{ cursor: "pointer", background: "transparent" }}
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
