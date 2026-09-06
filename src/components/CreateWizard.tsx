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
import {
  maybeSendWalletTx,
  requestBuyerAddress,
  sendEvmWalletTx,
  type EvmWalletTx,
} from "@/lib/onchain/wallet-client";
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
  network?: string;
  mediaBytes?: number;
  contractAddress?: string | null;
  deployStatus?: string | null;
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

/** Keep per-piece editors only for small sets — large drops use CSV. */
const INLINE_DETAIL_LIMIT = 24;

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
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [mintProgress, setMintProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [deployNote, setDeployNote] = useState<string | null>(null);

  const steps = useMemo(() => stepDefs(intent), [intent]);
  const step = steps[stepIndex] ?? steps[0];
  const selected = collections.find((c) => c.id === collectionId);
  const batchUpload = intent === "drop";
  const usedBytes =
    (selected?.mediaBytes ?? 0) + pieces.reduce((sum, item) => sum + item.size, 0);
  const piecesBytes = pieces.reduce((sum, item) => sum + item.size, 0);

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
    if (collectionId) {
      const existing = collections.find((c) => c.id === collectionId);
      if (
        existing?.deployStatus === "confirmed" &&
        existing.contractAddress
      ) {
        return collectionId;
      }
      // Existing collection still needs deploy confirmation.
      if (existing && existing.deployStatus !== "confirmed") {
        throw new Error(
          "This collection is not deployed on-chain yet — create a new one or finish deploy",
        );
      }
      return collectionId;
    }
    const title = newTitle.trim();
    if (!title) throw new Error("Choose an existing collection or name a new one");

    const creatorAddress = await requestBuyerAddress(
      network === "solana" ? "solana" : network === "boing" ? "boing" : "evm",
    );

    const res = await fetch("/api/collections", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        network,
        creatorAddress: creatorAddress || undefined,
      }),
    });
    const data = await res.json();
    if (res.status === 401) throw new Error("sign_in");
    if (!res.ok) {
      throw new Error(
        (data.errors && data.errors.join(", ")) || data.error || "collection_failed",
      );
    }
    const id = String(data.collection.id);
    const deployIntent = data.deployIntent as
      | {
          status: string;
          contractAddress: string;
          escrowAddress?: string;
          walletTx?: unknown;
        }
      | null
      | undefined;

    if (deployIntent?.walletTx) {
      setDeployNote("Confirm collection deploy in your wallet (you pay gas)…");
      const wt = deployIntent.walletTx as EvmWalletTx & { chain: string };
      let txHash: string | null = null;
      if (wt.chain === "evm") {
        txHash = await sendEvmWalletTx(wt);
      } else {
        txHash = await maybeSendWalletTx({
          walletTx: deployIntent.walletTx,
          listingId: id,
          action: "mint",
        });
      }
      if (!txHash) {
        throw new Error(
          "Wallet required to deploy the collection contract on your mint network",
        );
      }
      const confirm = await fetch(`/api/collections/${id}/deploy`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash,
          contractAddress: deployIntent.contractAddress,
          escrowAddress: deployIntent.escrowAddress,
        }),
      });
      const confirmData = await confirm.json();
      if (!confirm.ok) {
        throw new Error(confirmData.error || "deploy_confirm_failed");
      }
      setDeployNote(`Collection deployed · ${txHash.slice(0, 10)}…`);
    } else if (data.collection?.deployStatus === "confirmed") {
      setDeployNote("Collection contract ready (simulated or already deployed).");
    }

    setCollectionId(id);
    window.dispatchEvent(new Event("fm-collections-changed"));
    loadMine();
    return id;
  }

  async function uploadFiles(files: File[]) {
    setBusy(true);
    setError(null);
    setUploadProgress(null);
    try {
      if (!files.length) throw new Error("No files selected");
      // Snapshot File[] before any await — clearing the input empties a live FileList.
      const id = await ensureCollection();
      const capped = batchUpload
        ? files
        : files.slice(0, Math.max(0, 1 - pieces.length));
      if (!capped.length) {
        throw new Error(
          intent === "single" || intent === "auction"
            ? "This listing already has one artwork file"
            : "No files selected",
        );
      }

      setUploadProgress({ current: 0, total: capped.length });
      let runningBytes = usedBytes;

      for (let i = 0; i < capped.length; i++) {
        const file = capped[i]!;
        if (runningBytes + file.size > COLLECTION_MEDIA_CAP_BYTES) {
          throw new Error(
            `Stopped at ${i} of ${capped.length} — this collection is at the 10 GB art cap`,
          );
        }
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
        const piece: Piece = {
          key: `${data.mediaHash}-${file.name}-${i}`,
          title: titleFromFile(file.name),
          description: "",
          fileName: file.name,
          mediaUrl: data.mediaUrl,
          mediaHash: data.mediaHash,
          size: Number(data.size ?? file.size),
          traits: [],
          maxSupply: dropKind === "limited" ? "1" : "",
        };
        runningBytes += piece.size;
        setPieces((current) =>
          batchUpload ? [...current, piece] : [piece],
        );
        setUploadProgress({ current: i + 1, total: capped.length });
      }
      loadMine();
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload_failed");
    } finally {
      setBusy(false);
      setUploadProgress(null);
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

      const listingIds: string[] = [];
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
        const listingId = String(data.listing?.id ?? data.id ?? "");
        if (listingId) listingIds.push(listingId);
      }

      // Mint into the collection contract (creator pays gas).
      const creatorAddress = await requestBuyerAddress(
        network === "solana" ? "solana" : network === "boing" ? "boing" : "evm",
      );
      const mintPrep = await fetch(`/api/collections/${id}/mint`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          listingIds,
          creatorAddress: creatorAddress || undefined,
        }),
      });
      const mintPrepData = await mintPrep.json();
      if (!mintPrep.ok) {
        throw new Error(mintPrepData.error || "mint_prepare_failed");
      }
      const batches = (mintPrepData.batches ?? []) as Array<{
        listingIds: string[];
        provisionalTokenIds: string[];
        walletTx?: unknown;
        contractAddress?: string;
        txHash?: string;
        status?: string;
      }>;
      if (batches.length) {
        setMintProgress({ current: 0, total: batches.length });
        for (let b = 0; b < batches.length; b++) {
          const batch = batches[b]!;
          let txHash = batch.txHash || "";
          if (batch.walletTx) {
            const wt = batch.walletTx as EvmWalletTx & { chain: string };
            if (wt.chain === "evm") {
              txHash = await sendEvmWalletTx(wt);
            } else {
              txHash =
                (await maybeSendWalletTx({
                  walletTx: batch.walletTx,
                  listingId: batch.listingIds[0] ?? id,
                  action: "mint",
                })) || "";
            }
            if (!txHash) {
              throw new Error(
                "Wallet required to mint pieces into your collection (you pay gas)",
              );
            }
          } else if (!txHash) {
            txHash = `simulated-mint:${id}:${b}:${Date.now()}`;
          }
          const confirm = await fetch(`/api/collections/${id}/mint`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "confirm",
              txHash,
              listingIds: batch.listingIds,
              tokenIds: batch.provisionalTokenIds,
              contractAddress: batch.contractAddress,
            }),
          });
          const confirmData = await confirm.json();
          if (!confirm.ok) {
            throw new Error(confirmData.error || "mint_confirm_failed");
          }
          setMintProgress({ current: b + 1, total: batches.length });
        }
      }

      const label =
        intent === "drop"
          ? `${pieces.length} ${dropKind === "open" ? "open-edition" : "limited"} piece${pieces.length === 1 ? "" : "s"}`
          : intent === "auction"
            ? "auction listing"
            : "1/1 listing";
      setOk(
        `Published ${label} and minted on-chain into your collection. Collectors buy in USD; withdraw later transfers the existing token.`,
      );
      setPieces([]);
      setMintProgress(null);
      setStepIndex(0);
      setIntent(null);
      router.refresh();
      window.dispatchEvent(new Event("fm-collections-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
      setMintProgress(null);
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
              Works live in a creator-owned set. Creating a new collection
              deploys its on-chain contract — you pay gas from a linked wallet.
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
              {batchUpload
                ? "Select many files at once (Shift or Ctrl/Cmd click). Up to 100 MB each, 10 GB per collection — no previews, just a running count."
                : "Upload one file for this listing."}
            </p>
            <label>
              {batchUpload ? "Artwork files" : "Artwork file"}
              <input
                type="file"
                multiple={batchUpload}
                accept={ACCEPT}
                disabled={busy}
                style={fieldStyle}
                onChange={(e) => {
                  const selectedFiles = e.target.files
                    ? Array.from(e.target.files)
                    : [];
                  e.target.value = "";
                  if (selectedFiles.length) void uploadFiles(selectedFiles);
                }}
              />
            </label>
            <div className="create-wizard__upload-status" aria-live="polite">
              {uploadProgress ? (
                <p className="create-wizard__upload-count">
                  Uploading {uploadProgress.current} of {uploadProgress.total}…
                </p>
              ) : null}
              <p className="drop-studio__quota">
                {pieces.length
                  ? `${pieces.length} file${pieces.length === 1 ? "" : "s"} ready · ${formatBytes(piecesBytes)} this batch · ${formatBytes(usedBytes)} of ${formatBytes(COLLECTION_MEDIA_CAP_BYTES)} collection total`
                  : `0 files ready · ${formatBytes(usedBytes)} of ${formatBytes(COLLECTION_MEDIA_CAP_BYTES)} used`}
              </p>
              {pieces.length ? (
                <button
                  type="button"
                  className="badge"
                  disabled={busy}
                  style={{
                    cursor: busy ? "default" : "pointer",
                    background: "transparent",
                    justifySelf: "start",
                  }}
                  onClick={() => {
                    setPieces([]);
                    setError(null);
                  }}
                >
                  Clear files
                </button>
              ) : null}
            </div>
          </>
        ) : null}

        {step.id === "details" ? (
          <>
            <h2 className="display create-wizard__title">Titles & traits</h2>
            <p className="create-wizard__lead">
              {batchUpload && pieces.length > INLINE_DETAIL_LIMIT
                ? `${pieces.length} files are titled from their filenames. Import a CSV to set names, traits, and supply in bulk.`
                : `Name each piece and add traits by hand${batchUpload ? " or import an OpenSea-style CSV" : ""}.`}
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
            {batchUpload ? (
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
                <p className="create-wizard__hint">
                  {pieces.length} file{pieces.length === 1 ? "" : "s"} ·{" "}
                  {pieces.filter((p) => p.traits.length).length} with traits
                  applied
                </p>
              </div>
            ) : null}
            {pieces.length <= INLINE_DETAIL_LIMIT ? (
              <div className="drop-studio__items">
                {pieces.map((item, index) => (
                  <article key={item.key} className="drop-studio__item drop-studio__item--compact">
                    <div className="drop-studio__item-body">
                      <p className="create-wizard__hint" style={{ margin: 0 }}>
                        {item.fileName}
                      </p>
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
                      {batchUpload && dropKind === "limited" ? (
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
            ) : (
              <p className="create-wizard__hint">
                Inline editors are hidden above {INLINE_DETAIL_LIMIT} files so the
                page stays responsive. Use the CSV import above for titles and
                traits.
              </p>
            )}
          </>
        ) : null}

        {step.id === "review" ? (
          <>
            <h2 className="display create-wizard__title">Review & publish</h2>
            <p className="create-wizard__lead">
              Soft-launch lists the works, then mints them into your collection
              contract (you pay gas in batches). Collectors buy in USD; withdraw
              later transfers an already-minted token.
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
                <dt>Files</dt>
                <dd>
                  {pieces.length} ready · {formatBytes(piecesBytes)} this batch ·{" "}
                  {formatBytes(usedBytes)} collection total
                </dd>
              </div>
              <div>
                <dt>Traits</dt>
                <dd>
                  {pieces.filter((p) => p.traits.length).length} of{" "}
                  {pieces.length} have traits
                </dd>
              </div>
            </dl>
          </>
        ) : null}

        {deployNote ? (
          <p style={{ color: "var(--emergent)", margin: "0.75rem 0 0" }}>
            {deployNote}
          </p>
        ) : null}
        {mintProgress ? (
          <p style={{ color: "var(--ink)", margin: "0.75rem 0 0" }}>
            Minting on-chain batch {mintProgress.current} of {mintProgress.total}
            … (you pay gas)
          </p>
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
