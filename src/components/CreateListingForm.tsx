"use client";

import { maybeSendWalletTx } from "@/lib/onchain/wallet-client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateListingForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [media, setMedia] = useState<{
    mediaUrl: string;
    mediaHash: string;
  } | null>(null);

  async function uploadFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "upload_failed");
      setMedia({ mediaUrl: data.mediaUrl, mediaHash: data.mediaHash });
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload_failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    const fd = new FormData(e.currentTarget);
    const type = String(fd.get("type"));
    const textMedia = String(fd.get("mediaContent") ?? "");
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
      mediaContent: media ? undefined : textMedia,
      mediaHash: media?.mediaHash,
      mediaUrl: media?.mediaUrl,
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

    if (!payload.mediaHash && !payload.mediaContent) {
      setError("Upload a file or paste media content");
      setBusy(false);
      return;
    }

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
      let note = `Listed “${data.listing.title}” · stage ${data.listing.stage}`;
      try {
        const hash = await maybeSendWalletTx({
          walletTx: data.walletTx,
          listingId: data.listing.id,
          action: "mint",
          amountUsd: data.listing.priceUsd ?? undefined,
        });
        if (hash) {
          note += ` · on-chain mint ${hash.slice(0, 14)}…`;
        } else {
          note += " · mint intent recorded";
        }
      } catch (walletErr) {
        note += ` · wallet: ${walletErr instanceof Error ? walletErr.message : "skipped"}`;
      }
      setOk(note);
      router.refresh();
      e.currentTarget.reset();
      setMedia(null);
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
            <option value="evm">EVM (Sepolia)</option>
            <option value="solana">Solana (Devnet)</option>
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
          Artwork file
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,text/plain"
            style={fieldStyle}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadFile(file);
            }}
          />
        </label>
        {media ? (
          <p style={{ color: "var(--emergent)", fontSize: "0.85rem", margin: "0.4rem 0 0" }}>
            Uploaded · hash {media.mediaHash.slice(0, 12)}… ·{" "}
            <a href={media.mediaUrl} target="_blank" rel="noreferrer">
              preview
            </a>
          </p>
        ) : null}
      </div>
      <div>
        <label>
          Or paste text media (hashed for duplicates)
          <textarea
            name="mediaContent"
            rows={2}
            placeholder="Optional if you uploaded a file…"
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
        {busy ? "Working…" : "Soft-launch listing"}
      </button>
      {error ? <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
      {ok ? <p style={{ color: "var(--emergent)", margin: 0 }}>{ok}</p> : null}
    </form>
  );
}
