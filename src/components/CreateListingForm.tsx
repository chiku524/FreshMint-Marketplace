"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ListingKind = "single" | "collection" | "open_edition" | "auction";
type CollectionOption = { id: string; title: string; chain: string };

function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function CreateListingForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [listingType, setListingType] = useState<ListingKind>("single");
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [media, setMedia] = useState<{
    mediaUrl: string;
    mediaHash: string;
  } | null>(null);

  useEffect(() => {
    function loadMine() {
      void fetch("/api/collections?mine=1", { credentials: "include" })
        .then((res) => (res.ok ? res.json() : { collections: [] }))
        .then((data: { collections?: CollectionOption[] }) => {
          setCollections(data.collections ?? []);
        })
        .catch(() => setCollections([]));
    }
    loadMine();
    window.addEventListener("fm-collections-changed", loadMine);
    return () => window.removeEventListener("fm-collections-changed", loadMine);
  }, []);

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
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    setOk(null);
    const fd = new FormData(form);
    const type = String(fd.get("type")) as ListingKind;
    const textMedia = String(fd.get("mediaContent") ?? "");
    const collectionId = String(fd.get("collectionId") ?? "");
    const scheduled =
      type === "open_edition" || type === "auction";
    const payload = {
      title: String(fd.get("title")),
      description: String(fd.get("description") ?? ""),
      type,
      network: String(fd.get("network")),
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
      collectionId: collectionId || null,
      isCollectionHero: fd.get("isCollectionHero") === "on",
      oeStartsAt:
        type === "open_edition"
          ? fromLocalInput(String(fd.get("oeStartsAt") ?? ""))
          : null,
      oeEndsAt:
        type === "open_edition"
          ? fromLocalInput(String(fd.get("oeEndsAt") ?? ""))
          : null,
      auctionStartsAt:
        type === "auction"
          ? fromLocalInput(String(fd.get("auctionStartsAt") ?? ""))
          : null,
      auctionEndsAt:
        type === "auction"
          ? fromLocalInput(String(fd.get("auctionEndsAt") ?? ""))
          : null,
    };

    if (!payload.mediaHash && !payload.mediaContent) {
      setError("Upload a file or paste media content");
      setBusy(false);
      return;
    }
    if (type === "collection" && !payload.collectionId) {
      setError("Create or choose a collection for this piece");
      setBusy(false);
      return;
    }
    if (scheduled && type === "open_edition" && (!payload.oeStartsAt || !payload.oeEndsAt)) {
      setError("Set an open-edition start and end");
      setBusy(false);
      return;
    }
    if (scheduled && type === "auction" && (!payload.auctionStartsAt || !payload.auctionEndsAt)) {
      setError("Set an auction start and end");
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
      setOk(
        `Listed “${data.listing.title}” · stage ${data.listing.stage}. Stays on FreshMint until someone withdraws it to a wallet.`,
      );
      router.refresh();
      form.reset();
      setMedia(null);
      setListingType("single");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    color: "var(--ink)",
    padding: "0.55rem 0.7rem",
    marginTop: "0.35rem",
  };
  const now = Date.now();

  return (
    <form
      onSubmit={onSubmit}
      style={{
        display: "grid",
        gap: "0.9rem",
        border: "1px solid var(--line)",
        padding: "1.25rem",
        background: "var(--panel)",
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
          <select
            name="type"
            value={listingType}
            onChange={(e) => setListingType(e.target.value as ListingKind)}
            style={fieldStyle}
          >
            <option value="single">1/1 single</option>
            <option value="open_edition">Scheduled open edition</option>
            <option value="auction">Scheduled auction</option>
            <option value="collection">Collection piece</option>
          </select>
        </label>
        <label>
          Network
          <select name="network" defaultValue="ethereum" style={fieldStyle}>
            <option value="ethereum">Ethereum (Sepolia)</option>
            <option value="base">Base (Sepolia)</option>
            <option value="arbitrum">Arbitrum (Sepolia)</option>
            <option value="optimism">Optimism (Sepolia)</option>
            <option value="solana">Solana (Devnet)</option>
            <option value="boing">Boing Testnet</option>
          </select>
        </label>
      </div>
      <div>
        <label>
          Collection {listingType === "collection" ? "(required)" : "(optional)"}
          <select name="collectionId" defaultValue="" style={fieldStyle}>
            <option value="">
              {collections.length ? "Standalone listing" : "No collections yet"}
            </option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", gap: "0.45rem", marginTop: "0.55rem", fontSize: "0.9rem" }}>
          <input type="checkbox" name="isCollectionHero" />
          Use as collection hero
        </label>
      </div>
      {listingType === "open_edition" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <label>
            Drop starts
            <input
              name="oeStartsAt"
              type="datetime-local"
              required
              defaultValue={toLocalInput(now)}
              style={fieldStyle}
            />
          </label>
          <label>
            Drop ends
            <input
              name="oeEndsAt"
              type="datetime-local"
              required
              defaultValue={toLocalInput(now + 24 * 60 * 60 * 1000)}
              style={fieldStyle}
            />
          </label>
        </div>
      ) : null}
      {listingType === "auction" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <label>
            Auction starts
            <input
              name="auctionStartsAt"
              type="datetime-local"
              required
              defaultValue={toLocalInput(now)}
              style={fieldStyle}
            />
          </label>
          <label>
            Auction ends
            <input
              name="auctionEndsAt"
              type="datetime-local"
              required
              defaultValue={toLocalInput(now + 6 * 60 * 60 * 1000)}
              style={fieldStyle}
            />
          </label>
        </div>
      ) : null}
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
