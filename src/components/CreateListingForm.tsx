"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateListingForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    const fd = new FormData(e.currentTarget);
    const type = String(fd.get("type"));
    const payload = {
      title: String(fd.get("title")),
      description: String(fd.get("description") ?? ""),
      type,
      chain: String(fd.get("chain")),
      priceUsd: fd.get("priceUsd") ? Number(fd.get("priceUsd")) : null,
      medium: String(fd.get("medium")),
      styleTags: String(fd.get("styleTags") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      mediaContent: String(fd.get("mediaContent")),
      publishSoftLaunch: true,
      oeStartsAt:
        type === "open_edition" ? new Date().toISOString() : null,
      oeEndsAt:
        type === "open_edition"
          ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          : null,
      auctionStartsAt: type === "auction" ? new Date().toISOString() : null,
      auctionEndsAt:
        type === "auction"
          ? new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
          : null,
    };

    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          (data.errors && data.errors.join(", ")) || data.error || "failed",
        );
      }
      setOk(`Listed “${data.listing.title}” at stage ${data.listing.stage}`);
      router.refresh();
      e.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(12,31,26,0.65)",
    border: "1px solid var(--line)",
    color: "var(--ink)",
    padding: "0.55rem 0.7rem",
    marginTop: "0.35rem",
  };

  return (
    <form
      onSubmit={onSubmit}
      style={{
        display: "grid",
        gap: "0.9rem",
        maxWidth: "36rem",
        border: "1px solid var(--line)",
        padding: "1.25rem",
        background: "rgba(20,53,44,0.45)",
      }}
    >
      <div>
        <label>
          Title
          <input name="title" required style={fieldStyle} />
        </label>
      </div>
      <div>
        <label>
          Description
          <textarea name="description" rows={3} style={fieldStyle} />
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <label>
          Type
          <select name="type" defaultValue="single" style={fieldStyle}>
            <option value="single">1/1 single</option>
            <option value="open_edition">Open edition</option>
            <option value="auction">Auction</option>
            <option value="collection">Collection piece</option>
          </select>
        </label>
        <label>
          Chain
          <select name="chain" defaultValue="evm" style={fieldStyle}>
            <option value="evm">EVM (Sepolia sim)</option>
            <option value="solana">Solana (Devnet sim)</option>
          </select>
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <label>
          Price USD
          <input name="priceUsd" type="number" min={0} step="1" style={fieldStyle} />
        </label>
        <label>
          Medium
          <input name="medium" defaultValue="digital" required style={fieldStyle} />
        </label>
      </div>
      <div>
        <label>
          Style tags (comma-separated)
          <input name="styleTags" placeholder="ink, minimal" style={fieldStyle} />
        </label>
      </div>
      <div>
        <label>
          Media content (hashed for duplicates)
          <textarea
            name="mediaContent"
            required
            rows={3}
            placeholder="Paste artwork bytes, SVG, or unique text stand-in…"
            style={fieldStyle}
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="badge featured"
        style={{
          cursor: "pointer",
          background: "transparent",
          justifySelf: "start",
          padding: "0.55rem 0.9rem",
        }}
      >
        {busy ? "Minting…" : "Soft-launch listing"}
      </button>
      {error ? <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
      {ok ? <p style={{ color: "var(--emergent)", margin: 0 }}>{ok}</p> : null}
    </form>
  );
}
