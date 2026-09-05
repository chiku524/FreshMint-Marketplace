"use client";

import { TraitEditor } from "@/components/TraitEditor";
import type { NftTrait } from "@/lib/discovery/types";
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
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";

type Intent = "drop" | "single" | "auction";
type DropKind = "limited" | "open";

type CollectionOption = {
  id: string;
  title: string;
  chain: string;
  mediaBytes?: number;
};

type Piece = {
  key: string;
  title: string;
  description: string;
  fileName: string;
  mediaUrl: string;
  mediaHash: string;
  size: number;
  traits: NftTrait[];
  maxSupply: string;
};

const fieldStyle: CSSProperties = {
  width: "100%",
  background: "var(--panel)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
  padding: "0.55rem 0.7rem",
  marginTop: "0.35rem",
};

const ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,video/mp4,video/webm,audio/mpeg,audio/wav";

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

function stepDefs(intent: Intent | null) {
  const base = [
    { id: "intent", label: "Type" },
    { id: "collection", label: "Collection" },
    { id: "schedule", label: "Schedule" },
    { id: "artwork", label: "Artwork" },
    { id: "details", label: "Details" },
    { id: "review", label: "Review" },
  ] as const;
  if (intent === "single") {
    return base.filter((s) => s.id !== "schedule");
  }
  return [...base];
}

export function CreateWizard() {
  const router = useRouter();
  const now = Date.now();

  const [stepIndex, setStepIndex] = useState(0);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [csvNote, setCsvNote] = useState<string | null>(null);

  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [collectionId, setCollectionId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [network, setNetwork] = useState("ethereum");

  const [dropKind, setDropKind] = useState<DropKind>("limited");
  const [startsAt, setStartsAt] = useState(toLocalInput(now + 60 * 60 * 1000));
  const [endsAt, setEndsAt] = useState(toLocalInput(now + 25 * 60 * 60 * 1000));
  const [priceUsd, setPriceUsd] = useState("25");
  const [medium, setMedium] = useState("digital");
  const [styleTags, setStyleTags] = useState("");

  const [pieces, setPieces] = useState<Piece[]>([]);

  const steps = useMemo(() => stepDefs(intent), [intent]);
  const step = steps[stepIndex] ?? steps[0];
  const selected = collections.find((c) => c.id === collectionId);
  const usedBytes =
    (selected?.mediaBytes ?? 0) + pieces.reduce((sum, item) => sum + item.size, 0);

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

  function goBack() {
    setError(null);
    setStepIndex((i) => Math.max(0, i - 1));
  }

  async function ensureCollection(): Promise<string> {
    if (collectionId) return collectionId;
    const title = newTitle.trim();
    if (!title) throw new Error("Choose an existing collection or name a new one");
    const res = await fetch("/api/collections", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, network }),
    });
    const data = await res.json();
    if (res.status === 401) throw new Error("sign_in");
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
      const next: Piece[] = [];
      const list = Array.from(files);
      const capped =
        intent === "drop" ? list : list.slice(0, Math.max(0, 1 - pieces.length));
      for (const file of capped) {
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
          description: "",
          fileName: file.name,
          mediaUrl: data.mediaUrl,
          mediaHash: data.mediaHash,
          size: Number(data.size ?? file.size),
          traits: [],
          maxSupply: dropKind === "limited" ? "1" : "",
        });
      }
      setPieces((current) =>
        intent === "drop" ? [...current, ...next] : next.length ? next : current,
      );
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
    if (!pieces.length) {
      setError("Upload artwork first, then import the CSV");
      setCsvNote(null);
      return;
    }
    let matched = 0;
    setPieces((current) =>
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
          description: row.description || item.description,
          traits: row.traits.length ? row.traits : item.traits,
          maxSupply:
            row.maxSupply != null ? String(row.maxSupply) : item.maxSupply,
        };
      }),
    );
    setError(null);
    setCsvNote(
      matched
        ? `Applied metadata to ${matched} of ${pieces.length} pieces`
        : "No CSV rows matched your file names — check file_name values",
    );
  }

  async function advance() {
    setError(null);
    setOk(null);

    if (step.id === "intent") {
      if (!intent) {
        setError("Pick what you want to create");
        return;
      }
      setStepIndex(1);
      return;
    }

    if (step.id === "collection") {
      if (!collectionId && !newTitle.trim()) {
        setError("Choose or name a collection");
        return;
      }
      setBusy(true);
      try {
        await ensureCollection();
        setStepIndex((i) => i + 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "collection_failed");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (step.id === "schedule") {
      const start = fromLocalInput(startsAt);
      const end = fromLocalInput(endsAt);
      if (!start || !end) {
        setError("Set a start and end time");
        return;
      }
      if (new Date(end).getTime() <= new Date(start).getTime()) {
        setError("End must be after the start");
        return;
      }
      if (!(Number(priceUsd) > 0)) {
        setError("Set a purchase price in USD");
        return;
      }
      setStepIndex((i) => i + 1);
      return;
    }

    if (step.id === "artwork") {
      if (!pieces.length) {
        setError("Upload at least one artwork file");
        return;
      }
      setStepIndex((i) => i + 1);
      return;
    }

    if (step.id === "details") {
      if (pieces.some((p) => !p.title.trim())) {
        setError("Give every piece a title");
        return;
      }
      if (intent === "single" && !(Number(priceUsd) > 0)) {
        setError("Set a purchase price in USD");
        return;
      }
      setStepIndex((i) => i + 1);
      return;
    }
  }

  async function publish() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      if (!intent) throw new Error("Pick what you want to create");
      if (!pieces.length) throw new Error("Upload artwork first");
      const id = await ensureCollection();
      const price = Number(priceUsd);
      if (!(price > 0)) throw new Error("Set a purchase price in USD");
      const tags = styleTags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const start = fromLocalInput(startsAt);
      const end = fromLocalInput(endsAt);

      if (intent === "drop") {
        if (!start || !end) throw new Error("Set a drop start and end");
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
          const raw =
            (scheduledData.errors && scheduledData.errors.join(", ")) ||
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
      }

      for (const [index, item] of pieces.entries()) {
        const supply =
          intent === "drop" && dropKind === "limited" && item.maxSupply
            ? Number(item.maxSupply)
            : intent === "drop" && dropKind === "open" && item.maxSupply
              ? Number(item.maxSupply)
              : null;
        let type: "single" | "collection" | "open_edition" | "auction" = "single";
        if (intent === "auction") type = "auction";
        else if (intent === "drop") {
          type =
            dropKind === "open" || (supply != null && supply > 1)
              ? "open_edition"
              : "collection";
        }

        const res = await fetch("/api/listings", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: item.title || `Piece ${index + 1}`,
            description:
              item.description ||
              (intent === "drop"
                ? `${dropKind === "open" ? "Open" : "Limited"} edition drop`
                : intent === "auction"
                  ? "Scheduled auction"
                  : ""),
            type,
            network,
            priceUsd: price,
            medium: medium.trim() || "digital",
            styleTags: tags,
            mediaHash: item.mediaHash,
            mediaUrl: item.mediaUrl,
            collectionId: id,
            isCollectionHero: index === 0,
            traits: parseTraits(item.traits),
            maxSupply: supply && supply > 0 ? supply : null,
            oeStartsAt: intent === "drop" ? start : null,
            oeEndsAt: intent === "drop" ? end : null,
            auctionStartsAt: intent === "auction" ? start : null,
            auctionEndsAt: intent === "auction" ? end : null,
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

      const label =
        intent === "drop"
          ? `${pieces.length} ${dropKind === "open" ? "open-edition" : "limited"} piece${pieces.length === 1 ? "" : "s"}`
          : intent === "auction"
            ? "auction listing"
            : "1/1 listing";
      setOk(
        `Published ${label}. Collectors buy from you on FreshMint — no wallet prompt.`,
      );
      setPieces([]);
      setStepIndex(0);
      setIntent(null);
      router.refresh();
      window.dispatchEvent(new Event("fm-collections-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="create-wizard">
      <ol className="create-wizard__steps" aria-label="Creation steps">
        {steps.map((s, index) => (
          <li
            key={s.id}
            className={
              index === stepIndex
                ? "is-current"
                : index < stepIndex
                  ? "is-done"
                  : undefined
            }
          >
            <span className="create-wizard__step-num">{index + 1}</span>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>

      <div className="create-wizard__panel">
        {step.id === "intent" ? (
          <>
            <h2 className="display create-wizard__title">What are you creating?</h2>
            <p className="create-wizard__lead">
              One path at a time — a timed drop, a single 1/1, or a scheduled
              auction window.
            </p>
            <div className="create-wizard__choices" role="group" aria-label="Creation type">
              {(
                [
                  {
                    id: "drop" as const,
                    title: "Collection drop",
                    body: "Limited or open edition. Upload many works, traits CSV, schedule the window.",
                  },
                  {
                    id: "single" as const,
                    title: "1/1 listing",
                    body: "One unique piece in a collection. Soft-launch to Open Lane.",
                  },
                  {
                    id: "auction" as const,
                    title: "Scheduled auction",
                    body: "Fixed USD price with a start and end window on the calendar.",
                  },
                ] as const
              ).map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className={intent === choice.id ? "is-active" : undefined}
                  aria-pressed={intent === choice.id}
                  onClick={() => {
                    setIntent(choice.id);
                    setPieces([]);
                    setCsvNote(null);
                    setError(null);
                  }}
                >
                  <strong className="display">{choice.title}</strong>
                  <span>{choice.body}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}

        {step.id === "collection" ? (
          <>
            <h2 className="display create-wizard__title">Collection & network</h2>
            <p className="create-wizard__lead">
              Works live in a creator-owned set. Pick a mint network for later
              withdrawal.
            </p>
            <div className="create-wizard__grid-2">
              <label>
                Existing collection
                <select
                  value={collectionId}
                  onChange={(e) => {
                    setCollectionId(e.target.value);
                    if (e.target.value) setNewTitle("");
                  }}
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
          </>
        ) : null}

        {step.id === "schedule" ? (
          <>
            <h2 className="display create-wizard__title">
              {intent === "auction" ? "Auction window" : "Drop schedule"}
            </h2>
            <p className="create-wizard__lead">
              Collectors buy from you in USD while the window is live.
            </p>
            {intent === "drop" ? (
              <>
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
                <p className="create-wizard__hint">
                  {dropKind === "limited"
                    ? "Each file is unique (or set a supply per piece)."
                    : "Collectors can buy copies until the window ends."}
                </p>
              </>
            ) : null}
            <div className="create-wizard__grid-3">
              <label>
                Starts
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  style={fieldStyle}
                />
              </label>
              <label>
                Ends
                <input
                  type="datetime-local"
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
                  value={priceUsd}
                  onChange={(e) => setPriceUsd(e.target.value)}
                  style={fieldStyle}
                />
              </label>
            </div>
          </>
        ) : null}

        {step.id === "artwork" ? (
          <>
            <h2 className="display create-wizard__title">Upload artwork</h2>
            <p className="create-wizard__lead">
              {intent === "drop"
                ? "Add as many files as you need — up to 100 MB each, 10 GB per collection."
                : "Upload one file for this listing."}
            </p>
            <label>
              Artwork file{intent === "drop" ? "s" : ""}
              <input
                type="file"
                multiple={intent === "drop"}
                accept={ACCEPT}
                style={fieldStyle}
                onChange={(e) => {
                  if (e.target.files?.length) void uploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <p className="drop-studio__quota">
              {formatBytes(usedBytes)} of {formatBytes(COLLECTION_MEDIA_CAP_BYTES)}{" "}
              used · {pieces.length} file{pieces.length === 1 ? "" : "s"}
            </p>
            {pieces.length ? (
              <div className="drop-studio__items">
                {pieces.map((item) => (
                  <article key={item.key} className="drop-studio__item">
                    <div
                      className="drop-studio__thumb"
                      style={{ backgroundImage: `url(${item.mediaUrl})` }}
                    />
                    <div className="drop-studio__item-body">
                      <strong className="display">{item.title || item.fileName}</strong>
                      <span className="create-wizard__hint">{item.fileName}</span>
                      <button
                        type="button"
                        className="badge"
                        style={{ cursor: "pointer", background: "transparent" }}
                        onClick={() =>
                          setPieces((current) =>
                            current.filter((row) => row.key !== item.key),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {step.id === "details" ? (
          <>
            <h2 className="display create-wizard__title">Titles & traits</h2>
            <p className="create-wizard__lead">
              Name each piece and add traits by hand
              {intent === "drop" ? " or import an OpenSea-style CSV" : ""}.
            </p>
            {intent === "single" ? (
              <div className="create-wizard__grid-2">
                <label>
                  Price USD
                  <input
                    type="number"
                    min={1}
                    step="1"
                    value={priceUsd}
                    onChange={(e) => setPriceUsd(e.target.value)}
                    style={fieldStyle}
                  />
                </label>
                <label>
                  Medium
                  <input
                    value={medium}
                    onChange={(e) => setMedium(e.target.value)}
                    style={fieldStyle}
                  />
                </label>
              </div>
            ) : (
              <label>
                Medium
                <input
                  value={medium}
                  onChange={(e) => setMedium(e.target.value)}
                  style={fieldStyle}
                />
              </label>
            )}
            <label>
              Style tags (comma-separated)
              <input
                value={styleTags}
                onChange={(e) => setStyleTags(e.target.value)}
                placeholder="ink, minimal"
                style={fieldStyle}
              />
            </label>
            {intent === "drop" ? (
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
                      void file
                        .text()
                        .then(applyMetadataCsv)
                        .catch(() => setError("Could not read that CSV"));
                    }}
                  />
                </label>
                <p className="drop-studio__quota">
                  Match rows with <code>file_name</code>.{" "}
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
                  <p
                    className="drop-studio__quota"
                    style={{ color: "var(--emergent)" }}
                  >
                    {csvNote}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="drop-studio__items">
              {pieces.map((item, index) => (
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
                          setPieces((current) =>
                            current.map((row, i) =>
                              i === index ? { ...row, title: e.target.value } : row,
                            ),
                          )
                        }
                        style={fieldStyle}
                      />
                    </label>
                    <label>
                      Description
                      <textarea
                        rows={2}
                        value={item.description}
                        onChange={(e) =>
                          setPieces((current) =>
                            current.map((row, i) =>
                              i === index
                                ? { ...row, description: e.target.value }
                                : row,
                            ),
                          )
                        }
                        style={fieldStyle}
                      />
                    </label>
                    {intent === "drop" && dropKind === "limited" ? (
                      <label>
                        Supply
                        <input
                          type="number"
                          min={1}
                          value={item.maxSupply}
                          onChange={(e) =>
                            setPieces((current) =>
                              current.map((row, i) =>
                                i === index
                                  ? { ...row, maxSupply: e.target.value }
                                  : row,
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
                        setPieces((current) =>
                          current.map((row, i) =>
                            i === index ? { ...row, traits } : row,
                          ),
                        )
                      }
                    />
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : null}

        {step.id === "review" ? (
          <>
            <h2 className="display create-wizard__title">Review & publish</h2>
            <p className="create-wizard__lead">
              Soft-launch to Open Lane. Collectors buy in USD — gas only if
              someone later withdraws.
            </p>
            <dl className="create-wizard__summary">
              <div>
                <dt>Type</dt>
                <dd>
                  {intent === "drop"
                    ? `${dropKind === "open" ? "Open" : "Limited"} edition drop`
                    : intent === "auction"
                      ? "Scheduled auction"
                      : "1/1 listing"}
                </dd>
              </div>
              <div>
                <dt>Collection</dt>
                <dd>
                  {selected?.title || newTitle.trim() || "New collection"} ·{" "}
                  {network}
                </dd>
              </div>
              {intent !== "single" ? (
                <div>
                  <dt>Window</dt>
                  <dd>
                    {new Date(startsAt).toLocaleString()} –{" "}
                    {new Date(endsAt).toLocaleString()}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Price</dt>
                <dd>${priceUsd}</dd>
              </div>
              <div>
                <dt>Pieces</dt>
                <dd>
                  {pieces.length} · {formatBytes(usedBytes)} media
                </dd>
              </div>
            </dl>
            <ul className="create-wizard__piece-list">
              {pieces.map((item) => (
                <li key={item.key}>
                  <span
                    className="create-wizard__mini-thumb"
                    style={{ backgroundImage: `url(${item.mediaUrl})` }}
                  />
                  <span>
                    <strong className="display">{item.title}</strong>
                    {item.traits.length
                      ? ` · ${item.traits.length} trait${item.traits.length === 1 ? "" : "s"}`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {error === "sign_in" ? (
          <p style={{ color: "var(--ink-muted)", margin: "0.75rem 0 0" }}>
            <Link href="/sign-in?next=/create">Sign in</Link> to continue.
          </p>
        ) : error ? (
          <p style={{ color: "var(--danger)", margin: "0.75rem 0 0" }}>{error}</p>
        ) : null}
        {ok ? (
          <p style={{ color: "var(--emergent)", margin: "0.75rem 0 0" }}>{ok}</p>
        ) : null}

        <div className="create-wizard__nav">
          <button
            type="button"
            className="badge"
            disabled={busy || stepIndex === 0}
            style={{
              cursor: stepIndex === 0 ? "default" : "pointer",
              background: "transparent",
              opacity: stepIndex === 0 ? 0.4 : 1,
            }}
            onClick={goBack}
          >
            Back
          </button>
          {step.id !== "review" ? (
            <button
              type="button"
              className="badge featured"
              disabled={busy}
              style={{ cursor: "pointer", background: "transparent" }}
              onClick={() => void advance()}
            >
              {busy ? "Working…" : "Continue"}
            </button>
          ) : (
            <button
              type="button"
              className="badge featured"
              disabled={busy}
              style={{ cursor: "pointer", background: "transparent" }}
              onClick={() => void publish()}
            >
              {busy ? "Publishing…" : "Publish"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
