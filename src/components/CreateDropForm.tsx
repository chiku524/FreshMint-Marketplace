"use client";

import { TraitEditor } from "@/components/TraitEditor";
import type { DropKind, NftTrait } from "@/lib/discovery/types";
import {
  COLLECTION_MEDIA_CAP_BYTES,
  DROP_METADATA_CSV_EXAMPLE,
  formatBytes,
  matchDropCsvRow,
  parseDropMetadataCsv,
  parseTraits,
} from "@/lib/marketplace/drops";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type CollectionOption = {
  id: string;
  title: string;
  chain: string;
  mediaBytes?: number;
  dropKind?: DropKind;
};

type DropItem = {
  key: string;
  title: string;
  fileName: string;
  mediaUrl: string;
  mediaHash: string;
  size: number;
  traits: NftTrait[];
  maxSupply: string;
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--panel)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
  padding: "0.55rem 0.7rem",
  marginTop: "0.35rem",
};

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

function titleFromFile(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 120);
}

export function CreateDropForm() {
  const router = useRouter();
  const now = Date.now();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [collectionId, setCollectionId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [network, setNetwork] = useState("ethereum");
  const [dropKind, setDropKind] = useState<"limited" | "open">("limited");
  const [startsAt, setStartsAt] = useState(toLocalInput(now + 60 * 60 * 1000));
  const [endsAt, setEndsAt] = useState(toLocalInput(now + 25 * 60 * 60 * 1000));
  const [priceUsd, setPriceUsd] = useState("25");
  const [items, setItems] = useState<DropItem[]>([]);
  const [csvNote, setCsvNote] = useState<string | null>(null);

  const selected = collections.find((c) => c.id === collectionId);
  const usedBytes =
    (selected?.mediaBytes ?? 0) + items.reduce((sum, item) => sum + item.size, 0);

  function loadMine() {
    void fetch("/api/collections?mine=1", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { collections: [] }))
      .then((data: { collections?: CollectionOption[] }) => {
        setCollections(data.collections ?? []);
      })
      .catch(() => setCollections([]));
  }

  useEffect(() => {
    loadMine();
    window.addEventListener("fm-collections-changed", loadMine);
    return () => window.removeEventListener("fm-collections-changed", loadMine);
  }, []);

  async function ensureCollection(): Promise<string> {
    if (collectionId) return collectionId;
    const title = newTitle.trim();
    if (!title) throw new Error("Create or choose a collection first");
    const res = await fetch("/api/collections", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, network }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        (data.errors && data.errors.join(", ")) || data.error || "collection_failed",
      );
    }
    const id = String(data.collection.id);
    setCollectionId(id);
    window.dispatchEvent(new Event("fm-collections-changed"));
    loadMine();
    return id;
  }

  async function uploadFiles(files: FileList | File[]) {
    setBusy(true);
    setError(null);
    try {
      const id = await ensureCollection();
      const next: DropItem[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("collectionId", id);
        const res = await fetch("/api/media/upload", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const data = await res.json();
        if (res.status === 401) throw new Error("sign_in");
        if (!res.ok) {
          throw new Error(
            data.error === "collection_quota"
              ? "This collection is at the 10 GB art cap"
              : data.error === "file_too_large"
                ? "Each file can be up to 100 MB"
                : (data.error ?? "upload_failed"),
          );
        }
        next.push({
          key: `${data.mediaHash}-${file.name}`,
          title: titleFromFile(file.name),
          fileName: file.name,
          mediaUrl: data.mediaUrl,
          mediaHash: data.mediaHash,
          size: Number(data.size ?? file.size),
          traits: [],
          maxSupply: dropKind === "limited" ? "1" : "",
        });
      }
      setItems((current) => [...current, ...next]);
      loadMine();
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload_failed");
    } finally {
      setBusy(false);
    }
  }

  function applyMetadataCsv(text: string) {
    const rows = parseDropMetadataCsv(text);
    if (!rows.length) {
      setError("CSV needs a header row and at least one item");
      setCsvNote(null);
      return;
    }
    if (!items.length) {
      setError("Upload artwork files first, then import the CSV");
      setCsvNote(null);
      return;
    }

    let matched = 0;
    setItems((current) =>
      current.map((item) => {
        const row = matchDropCsvRow(rows, {
          title: item.title,
          mediaUrl: item.mediaUrl,
          fileHint: item.fileName,
        });
        if (!row) return item;
        matched += 1;
        return {
          ...item,
          title: row.title || item.title,
          traits: row.traits.length ? row.traits : item.traits,
          maxSupply:
            row.maxSupply != null
              ? String(row.maxSupply)
              : item.maxSupply,
        };
      }),
    );
    setError(null);
    setCsvNote(
      matched
        ? `Applied traits to ${matched} of ${items.length} pieces from CSV`
        : "No CSV rows matched your uploaded file names — check file_name values",
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      if (!items.length) throw new Error("Upload at least one artwork file");
      const start = fromLocalInput(startsAt);
      const end = fromLocalInput(endsAt);
      if (!start || !end) throw new Error("Set a drop start and end");
      const price = Number(priceUsd);
      if (!(price > 0)) throw new Error("Set a purchase price in USD");

      const id = await ensureCollection();
      const scheduled = await fetch(`/api/collections/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dropKind,
          dropStartsAt: start,
          dropEndsAt: end,
          dropPriceUsd: price,
        }),
      });
      const scheduledData = await scheduled.json();
      if (!scheduled.ok) {
        const raw = (scheduledData.errors && scheduledData.errors.join(", ")) ||
          scheduledData.error ||
          "schedule_failed";
        throw new Error(
          raw.includes("oe_window_too_short")
            ? "Drops need to last at least one hour"
            : raw.includes("oe_window_too_long")
              ? "Drops can last up to seven days"
              : raw.includes("window_end_before_start")
                ? "Drop end must be after the start"
                : raw,
        );
      }

      for (const [index, item] of items.entries()) {
        const supply =
          dropKind === "limited" && item.maxSupply
            ? Number(item.maxSupply)
            : null;
        const type =
          dropKind === "open" || (supply != null && supply > 1)
            ? "open_edition"
            : "collection";
        const res = await fetch("/api/listings", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: item.title || `Piece ${index + 1}`,
            description: `${dropKind === "open" ? "Open" : "Limited"} edition drop`,
            type,
            network,
            priceUsd: price,
            medium: "digital",
            styleTags: [],
            mediaHash: item.mediaHash,
            mediaUrl: item.mediaUrl,
            collectionId: id,
            isCollectionHero: index === 0,
            traits: parseTraits(item.traits),
            maxSupply: supply && supply > 0 ? supply : null,
            oeStartsAt: start,
            oeEndsAt: end,
            publishSoftLaunch: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            (data.errors && data.errors.join(", ")) || data.error || "listing_failed",
          );
        }
      }

      setOk(
        `Scheduled ${items.length} ${dropKind === "open" ? "open-edition" : "limited"} piece${items.length === 1 ? "" : "s"}. Collectors buy from you on FreshMint — no wallet prompt.`,
      );
      setItems([]);
      router.refresh();
      window.dispatchEvent(new Event("fm-collections-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="drop-studio"
      style={{
        display: "grid",
        gap: "1rem",
        border: "1px solid var(--line)",
        padding: "1.25rem",
        background: "var(--panel)",
      }}
    >
      <p style={{ margin: 0, color: "var(--ink-muted)", maxWidth: "60ch" }}>
        Schedule a primary drop from your collection. Collectors buy the works
        from you — limited unique pieces or an open edition window.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <label>
          Existing collection
          <select
            value={collectionId}
            onChange={(e) => setCollectionId(e.target.value)}
            style={fieldStyle}
          >
            <option value="">Create one below…</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Or new collection title
          <input
            value={newTitle}
            onChange={(e) => {
              setNewTitle(e.target.value);
              if (e.target.value) setCollectionId("");
            }}
            placeholder="Dawn Set"
            maxLength={120}
            style={fieldStyle}
          />
        </label>
      </div>

      <div className="drop-studio__kinds" role="group" aria-label="Edition type">
        <button
          type="button"
          className={dropKind === "limited" ? "is-active" : undefined}
          aria-pressed={dropKind === "limited"}
          onClick={() => setDropKind("limited")}
        >
          Limited edition
        </button>
        <button
          type="button"
          className={dropKind === "open" ? "is-active" : undefined}
          aria-pressed={dropKind === "open"}
          onClick={() => setDropKind("open")}
        >
          Open edition
        </button>
      </div>
      <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.88rem" }}>
        {dropKind === "limited"
          ? "Each file is a unique piece (or set a supply on one artwork). Sold from you until the cap."
          : "Collectors can buy copies while the window is open. Unlimited unless you set a supply on a piece."}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
        <label>
          Drop starts
          <input
            type="datetime-local"
            required
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            style={fieldStyle}
          />
        </label>
        <label>
          Drop ends
          <input
            type="datetime-local"
            required
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            style={fieldStyle}
          />
        </label>
        <label>
          Price USD
          <input
            type="number"
            min={1}
            step="1"
            required
            value={priceUsd}
            onChange={(e) => setPriceUsd(e.target.value)}
            style={fieldStyle}
          />
        </label>
      </div>

      <label>
        Mint network
        <select
          value={network}
          onChange={(e) => setNetwork(e.target.value)}
          style={fieldStyle}
        >
          <option value="ethereum">Ethereum (Sepolia)</option>
          <option value="base">Base (Sepolia)</option>
          <option value="arbitrum">Arbitrum (Sepolia)</option>
          <option value="optimism">Optimism (Sepolia)</option>
          <option value="solana">Solana (Devnet)</option>
          <option value="boing">Boing Testnet</option>
        </select>
      </label>

      <div>
        <label>
          Artwork — up to 100 MB each, 10 GB per collection
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,video/mp4,video/webm,audio/mpeg,audio/wav"
            style={fieldStyle}
            onChange={(e) => {
              if (e.target.files?.length) void uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <p className="drop-studio__quota">
          {formatBytes(usedBytes)} of {formatBytes(COLLECTION_MEDIA_CAP_BYTES)} used
        </p>
      </div>

      <div>
        <label>
          Traits CSV (OpenSea-style)
          <input
            type="file"
            accept=".csv,text/csv"
            style={fieldStyle}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              void file.text().then(applyMetadataCsv).catch(() => {
                setError("Could not read that CSV");
              });
            }}
          />
        </label>
        <p className="drop-studio__quota">
          Match rows with a <code>file_name</code> column (same names as your
          uploads). Extra columns become traits.{" "}
          <button
            type="button"
            className="drop-studio__sample"
            onClick={() => {
              const blob = new Blob([DROP_METADATA_CSV_EXAMPLE], {
                type: "text/csv;charset=utf-8",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "freshmint-drop-metadata-sample.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download sample CSV
          </button>
        </p>
        {csvNote ? (
          <p className="drop-studio__quota" style={{ color: "var(--emergent)" }}>
            {csvNote}
          </p>
        ) : null}
      </div>

      {items.length ? (
        <div className="drop-studio__items">
          {items.map((item, index) => (
            <article key={item.key} className="drop-studio__item">
              <div
                className="drop-studio__thumb"
                style={{ backgroundImage: `url(${item.mediaUrl})` }}
              />
              <div className="drop-studio__item-body">
                <label>
                  Title
                  <input
                    value={item.title}
                    onChange={(e) =>
                      setItems((current) =>
                        current.map((row, i) =>
                          i === index ? { ...row, title: e.target.value } : row,
                        ),
                      )
                    }
                    style={fieldStyle}
                  />
                </label>
                {dropKind === "limited" ? (
                  <label>
                    Supply
                    <input
                      type="number"
                      min={1}
                      value={item.maxSupply}
                      onChange={(e) =>
                        setItems((current) =>
                          current.map((row, i) =>
                            i === index ? { ...row, maxSupply: e.target.value } : row,
                          ),
                        )
                      }
                      style={fieldStyle}
                    />
                  </label>
                ) : null}
                <TraitEditor
                  traits={item.traits}
                  onChange={(traits) =>
                    setItems((current) =>
                      current.map((row, i) =>
                        i === index ? { ...row, traits } : row,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="badge"
                  style={{ cursor: "pointer", background: "transparent" }}
                  onClick={() =>
                    setItems((current) => current.filter((_, i) => i !== index))
                  }
                >
                  Remove piece
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

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
        {busy ? "Working…" : "Schedule drop"}
      </button>
      {error === "sign_in" ? (
        <p style={{ color: "var(--ink-muted)", margin: 0 }}>
          <Link href="/sign-in?next=/create">Sign in</Link> to schedule a drop.
        </p>
      ) : error ? (
        <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
      ) : null}
      {ok ? <p style={{ color: "var(--emergent)", margin: 0 }}>{ok}</p> : null}
    </form>
  );
}
