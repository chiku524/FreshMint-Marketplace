"use client";

import { CreateLivePreview } from "@/components/CreateLivePreview";
import { PlatformFeeBreakdown } from "@/components/PlatformFeeBreakdown";
import { PublishConfetti } from "@/components/PublishConfetti";
import { TraitEditor } from "@/components/TraitEditor";
import { TxExplorerLink } from "@/components/TxExplorerLink";
import { WizardShell } from "@/components/WizardShell";
import {
  mapPoolSettled,
  retryWithBackoff,
} from "@/lib/async/pool";
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
  collectionHref as collectionPath,
  collectionSlugIssueMessage,
  normalizeCollectionSlug,
  sanitizeCollectionSlugInput,
  suggestCollectionSlug,
  validateCollectionSlugFormat,
  type CollectionSlugIssue,
} from "@/lib/marketplace/collection-slug";
import {
  collectionTitleIssueMessage,
  validateCollectionTitleFormat,
  type CollectionTitleIssue,
} from "@/lib/marketplace/collection-title";
import { isExplorableTxHash } from "@/lib/onchain/explorer";
import {
  maybeSendWalletTx,
  requestBuyerAddress,
  sendBoingWalletTxDetailed,
  sendEvmWalletTx,
  type EvmWalletTx,
} from "@/lib/onchain/wallet-client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

/** Parallel media uploads — high enough to cut serial wait, low enough for Blob/API. */
const UPLOAD_CONCURRENCY = 4;
/** Listing drafts are lightweight JSON posts. */
const LISTING_CONCURRENCY = 6;
/** Soft-launch stage calls after mint. */
const STAGE_CONCURRENCY = 6;

function collectionNetworkOf(c: CollectionOption): string {
  return (c.network || c.chain || "").toLowerCase();
}

function isDeployReadyOption(c: CollectionOption): boolean {
  if (c.deployStatus !== "confirmed") return false;
  const addr = c.contractAddress?.trim();
  return Boolean(addr && !addr.startsWith("pending:"));
}

type Intent = "drop" | "single" | "auction";
type DropKind = "limited" | "open";

type CollectionOption = {
  id: string;
  title: string;
  slug?: string | null;
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

function uploadErrorMessage(code: string | undefined, fallback = "upload_failed"): string {
  if (code === "collection_quota") {
    return "This collection is at the 10 GB art cap";
  }
  if (code === "file_too_large") return "Each file can be up to 100 MB";
  if (code === "unsupported_type") return "Unsupported file type";
  if (code === "empty_file") return "Empty file skipped";
  return code || fallback;
}

function makeHttpError(
  message: string,
  status: number,
): Error & { status: number; retryable: boolean } {
  return Object.assign(new Error(message), {
    status,
    retryable: status === 429 || status >= 500,
  });
}

function stepDefs(intent: Intent | null) {
  const base = [
    { id: "intent", label: "Type" },
    { id: "collection", label: "Collection" },
    { id: "schedule", label: "Schedule" },
    { id: "artwork", label: "Artwork" },
    { id: "details", label: "Details" },
    { id: "review", label: "Mint & publish" },
  ] as const;
  if (intent === "single") {
    return base.filter((s) => s.id !== "schedule");
  }
  return [...base];
}

export function CreateWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [newSlug, setNewSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [titleStatus, setTitleStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    issue: CollectionTitleIssue | null;
    message: string | null;
    normalized: string | null;
  }>({
    checking: false,
    available: null,
    issue: null,
    message: null,
    normalized: null,
  });
  const [slugStatus, setSlugStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    issue: CollectionSlugIssue | null;
    message: string | null;
    normalized: string | null;
  }>({
    checking: false,
    available: null,
    issue: null,
    message: null,
    normalized: null,
  });
  const [collectionDescription, setCollectionDescription] = useState("");
  const [collectionImageUrl, setCollectionImageUrl] = useState<string | null>(
    null,
  );
  const [collectionBannerUrl, setCollectionBannerUrl] = useState<string | null>(
    null,
  );
  const [collectionWebsiteUrl, setCollectionWebsiteUrl] = useState("");
  const [collectionTwitterUrl, setCollectionTwitterUrl] = useState("");
  const [collectionDiscordUrl, setCollectionDiscordUrl] = useState("");
  const [collectionInstagramUrl, setCollectionInstagramUrl] = useState("");
  const [profileUploadBusy, setProfileUploadBusy] = useState(false);
  const [network, setNetwork] = useState("ethereum");

  const [dropKind, setDropKind] = useState<DropKind>("limited");
  const [startsAt, setStartsAt] = useState(toLocalInput(now + 60 * 60 * 1000));
  const [endsAt, setEndsAt] = useState(toLocalInput(now + 25 * 60 * 60 * 1000));
  const [priceUsd, setPriceUsd] = useState("25");
  const [saleMode, setSaleMode] = useState<"fixed" | "timed_window" | "english">("fixed");
  const [startingBidUsd, setStartingBidUsd] = useState("10");
  const [reserveUsd, setReserveUsd] = useState("");
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
  const [listProgress, setListProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [deployNote, setDeployNote] = useState<string | null>(null);
  const [published, setPublished] = useState<{
    listingIds: string[];
    collectionId: string;
    collectionSlug: string | null;
    label: string;
    collectionTitle: string;
    network: string;
    intent: Intent;
    dropKind: DropKind;
    priceUsd: string;
    pieceCount: number;
    heroTitle: string;
    heroDescription: string;
    heroMediaUrl: string;
    satelliteMediaUrls: string[];
    styleTags: string;
    mintTxHashes: string[];
  } | null>(null);

  const steps = useMemo(() => stepDefs(intent), [intent]);
  const step = steps[stepIndex] ?? steps[0];
  const selected = collections.find((c) => c.id === collectionId);
  const batchUpload = intent === "drop";
  const usedBytes =
    (selected?.mediaBytes ?? 0) + pieces.reduce((sum, item) => sum + item.size, 0);
  const piecesBytes = pieces.reduce((sum, item) => sum + item.size, 0);


  useEffect(() => {
    const raw = searchParams.get("intent");
    if (raw === "drop" || raw === "single" || raw === "auction") {
      setIntent(raw);
      // Skip the intent picker when deep-linked from Timed drops / Calendar.
      setStepIndex((idx) => (idx === 0 ? 1 : idx));
    }
  }, [searchParams]);


  function loadMine() {
    const base = new URLSearchParams({ mine: "1", network });
    const deployedParams = new URLSearchParams({
      mine: "1",
      network,
      deployed: "1",
    });
    void (async () => {
      try {
        const res = await fetch(`/api/collections?${base}`, {
          credentials: "include",
        });
        const data = (await res.json()) as { collections?: CollectionOption[] };
        const mine = data.collections ?? [];

        // Heal false negatives: wallet deploy landed on-chain but DB never confirmed.
        // Uses session-linked wallets on the server — no browser wallet prompt here.
        const pending = mine.filter((c) => !isDeployReadyOption(c));
        if (pending.length) {
          await Promise.all(
            pending.map((c) =>
              fetch(`/api/collections/${c.id}/deploy`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "sync" }),
              }).catch(() => null),
            ),
          );
        }

        const readyRes = await fetch(`/api/collections?${deployedParams}`, {
          credentials: "include",
        });
        const readyData = (await readyRes.json()) as {
          collections?: CollectionOption[];
        };
        setCollections(readyData.collections ?? []);
      } catch {
        setCollections([]);
      }
    })();
  }

  useEffect(() => {
    loadMine();
    window.addEventListener("fm-collections-changed", loadMine);
    return () => window.removeEventListener("fm-collections-changed", loadMine);
    // Reload when mint network changes so the dropdown stays network-scoped.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMine closes over network
  }, [network]);

  // Keep suggested slug in sync with title until the creator edits the slug field.
  useEffect(() => {
    if (collectionId || slugTouched) return;
    setNewSlug(suggestCollectionSlug(newTitle));
  }, [newTitle, collectionId, slugTouched]);

  // Debounced uniqueness + format feedback for new-collection names (global).
  // When editing/resuming an existing collection, exclude its own id so the
  // owner's current title is not reported as "already taken".
  useEffect(() => {
    const format = validateCollectionTitleFormat(newTitle);
    if (!format.ok) {
      setTitleStatus({
        checking: false,
        available: false,
        issue: format.issue,
        message: newTitle.trim()
          ? collectionTitleIssueMessage(format.issue)
          : null,
        normalized: null,
      });
      return;
    }
    let cancelled = false;
    setTitleStatus((prev) => ({
      ...prev,
      checking: true,
      available: null,
      issue: null,
      message: "Checking name availability…",
      normalized: format.normalized,
    }));
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ title: format.title });
          if (collectionId) params.set("excludeCollectionId", collectionId);
          const res = await fetch(
            `/api/collections/name-check?${params.toString()}`,
          );
          const data = (await res.json()) as {
            available?: boolean;
            issue?: CollectionTitleIssue | null;
            message?: string | null;
            normalized?: string | null;
          };
          if (cancelled) return;
          setTitleStatus({
            checking: false,
            available: Boolean(data.available),
            issue: data.issue ?? null,
            message: data.message ?? null,
            normalized: data.normalized ?? format.normalized,
          });
        } catch {
          if (cancelled) return;
          setTitleStatus({
            checking: false,
            available: null,
            issue: null,
            message: "Could not verify name — try again",
            normalized: format.normalized,
          });
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [newTitle, collectionId]);

  // Debounced uniqueness + format feedback for new-collection URLs.
  useEffect(() => {
    const format = validateCollectionSlugFormat(newSlug);
    if (!format.ok) {
      setSlugStatus({
        checking: false,
        available: false,
        issue: format.issue,
        message: newSlug.trim()
          ? collectionSlugIssueMessage(format.issue)
          : null,
        normalized: null,
      });
      return;
    }
    let cancelled = false;
    setSlugStatus((prev) => ({
      ...prev,
      checking: true,
      available: null,
      issue: null,
      message: "Checking availability…",
      normalized: format.slug,
    }));
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ slug: format.slug });
          if (collectionId) params.set("excludeCollectionId", collectionId);
          const res = await fetch(
            `/api/collections/slug-check?${params.toString()}`,
          );
          const data = (await res.json()) as {
            available?: boolean;
            issue?: CollectionSlugIssue | null;
            message?: string | null;
            slug?: string | null;
          };
          if (cancelled) return;
          setSlugStatus({
            checking: false,
            available: Boolean(data.available),
            issue: data.issue ?? null,
            message: data.message ?? null,
            normalized: data.slug ?? format.slug,
          });
        } catch {
          if (cancelled) return;
          setSlugStatus({
            checking: false,
            available: null,
            issue: null,
            message: "Could not verify slug — try again",
            normalized: format.slug,
          });
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [newSlug, collectionId]);

  const networkCollections = useMemo(
    () =>
      collections.filter(
        (c) =>
          collectionNetworkOf(c) === network ||
          (network !== "solana" &&
            network !== "boing" &&
            collectionNetworkOf(c) === "evm" &&
            !c.network),
      ),
    [collections, network],
  );

  function goBack() {
    setError(null);
    setStepIndex((i) => Math.max(0, i - 1));
  }

  async function runDeployWalletAndConfirm(input: {
    id: string;
    deployIntent: {
      status: string;
      contractAddress: string;
      escrowAddress?: string;
      walletTx?: unknown;
    };
    creatorAddress?: string | null;
  }): Promise<void> {
    const { id, deployIntent, creatorAddress } = input;
    if (!deployIntent.walletTx) return;
    setDeployNote("Confirm collection deploy in your wallet (you pay gas)…");
    const wt = deployIntent.walletTx as EvmWalletTx & { chain: string };
    let txHash: string | null = null;
    let contractAddress = deployIntent.contractAddress;
    if (wt.chain === "evm") {
      txHash = await sendEvmWalletTx(wt);
    } else if (wt.chain === "boing") {
      const sent = await sendBoingWalletTxDetailed(
        deployIntent.walletTx as Parameters<typeof sendBoingWalletTxDetailed>[0],
      );
      if (sent.contractAddress) contractAddress = sent.contractAddress;

      // Boing node returns `{ tx_hash: "ok" }` on mempool accept — not a real
      // tx id. Link the deploy from chain instead of erroring.
      if (!sent.txHash && sent.mempoolAccepted) {
        setDeployNote("Wallet accepted deploy — confirming from chain…");
        const pendingMarker = `pending:boing-accepted:${Date.now().toString(16)}`;
        let lastError = "onchain_deploy_not_found";
        for (let attempt = 0; attempt < 5; attempt++) {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 1500));
          }
          const sync = await fetch(`/api/collections/${id}/deploy`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "sync",
              creatorAddress: creatorAddress || undefined,
              contractAddress: sent.contractAddress || undefined,
              txHash: pendingMarker,
            }),
          });
          const syncData = await sync.json();
          if (sync.ok && syncData.collection) {
            const addr = String(syncData.collection.contractAddress || "");
            setDeployNote(
              addr
                ? `Collection deployed · ${addr.slice(0, 10)}…`
                : "Collection deployed (synced from chain)",
            );
            return;
          }
          lastError = syncData.error || lastError;
        }
        throw new Error(
          lastError === "onchain_deploy_not_found"
            ? "Deploy landed in the wallet but FreshMint could not link it yet — wait a few seconds and retry"
            : lastError,
        );
      }

      txHash = sent.txHash;
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
        contractAddress,
        escrowAddress: deployIntent.escrowAddress,
        creatorAddress: creatorAddress || undefined,
      }),
    });
    const confirmData = await confirm.json();
    if (!confirm.ok) {
      throw new Error(confirmData.error || "deploy_confirm_failed");
    }
    setDeployNote(`Collection deployed · ${txHash.slice(0, 10)}…`);
  }

  async function ensureCollection(): Promise<string> {
    const walletChain =
      network === "solana" ? "solana" : network === "boing" ? "boing" : "evm";

    if (collectionId) {
      const existing = collections.find((c) => c.id === collectionId);
      if (existing && isDeployReadyOption(existing)) {
        return collectionId;
      }

      const creatorAddress = await requestBuyerAddress(walletChain);

      // Heal: on-chain deploy succeeded but DB still says pending / provisional.
      const syncRes = await fetch(`/api/collections/${collectionId}/deploy`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync",
          creatorAddress: creatorAddress || undefined,
        }),
      });
      const syncData = await syncRes.json();
      if (syncRes.ok && syncData.collection) {
        setDeployNote("Linked existing on-chain collection deploy.");
        window.dispatchEvent(new Event("fm-collections-changed"));
        loadMine();
        return collectionId;
      }

      // Resume wallet deploy when nothing on-chain was found to sync.
      const prepRes = await fetch(`/api/collections/${collectionId}/deploy`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          creatorAddress: creatorAddress || undefined,
        }),
      });
      const prepData = await prepRes.json();
      if (prepRes.status === 401) throw new Error("sign_in");
      if (!prepRes.ok) {
        throw new Error(
          prepData.error === "onchain_deploy_not_found"
            ? "Could not find this collection on-chain — try creating a new one on the selected network"
            : prepData.error || "deploy_prepare_failed",
        );
      }
      if (prepData.alreadyDeployed) {
        loadMine();
        return collectionId;
      }
      if (prepData.deployIntent?.walletTx) {
        await runDeployWalletAndConfirm({
          id: collectionId,
          deployIntent: prepData.deployIntent,
          creatorAddress,
        });
        window.dispatchEvent(new Event("fm-collections-changed"));
        loadMine();
        return collectionId;
      }
      throw new Error(
        "This collection is not deployed on-chain yet — create a new one or finish deploy",
      );
    }
    const titleFormat = validateCollectionTitleFormat(newTitle);
    if (!titleFormat.ok) {
      throw new Error(collectionTitleIssueMessage(titleFormat.issue));
    }
    if (titleStatus.available === false) {
      throw new Error(
        titleStatus.message ||
          collectionTitleIssueMessage(titleStatus.issue || "taken"),
      );
    }

    const slugFormat = validateCollectionSlugFormat(newSlug);
    if (!slugFormat.ok) {
      throw new Error(collectionSlugIssueMessage(slugFormat.issue));
    }
    if (slugStatus.available === false) {
      throw new Error(
        slugStatus.message || collectionSlugIssueMessage(slugStatus.issue || "taken"),
      );
    }

    const creatorAddress = await requestBuyerAddress(walletChain);

    const res = await fetch("/api/collections", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: titleFormat.title,
        slug: slugFormat.slug,
        network,
        creatorAddress: creatorAddress || undefined,
        description: collectionDescription || undefined,
        imageUrl: collectionImageUrl,
        bannerUrl: collectionBannerUrl,
        websiteUrl: collectionWebsiteUrl || null,
        twitterUrl: collectionTwitterUrl || null,
        discordUrl: collectionDiscordUrl || null,
        instagramUrl: collectionInstagramUrl || null,
      }),
    });
    const data = await res.json();
    if (res.status === 401) throw new Error("sign_in");
    if (!res.ok) {
      const errs = Array.isArray(data.errors) ? data.errors : [];
      if (errs.includes("title_taken")) {
        throw new Error(collectionTitleIssueMessage("taken"));
      }
      const titleErr = errs.find(
        (e: string) => typeof e === "string" && e.startsWith("invalid_title_"),
      );
      if (titleErr) {
        const issue = String(titleErr).replace(
          "invalid_title_",
          "",
        ) as CollectionTitleIssue;
        throw new Error(collectionTitleIssueMessage(issue));
      }
      if (errs.includes("slug_taken")) {
        throw new Error(collectionSlugIssueMessage("taken"));
      }
      const slugErr = errs.find(
        (e: string) => typeof e === "string" && e.startsWith("invalid_slug_"),
      );
      if (slugErr) {
        const issue = String(slugErr).replace("invalid_slug_", "") as CollectionSlugIssue;
        throw new Error(collectionSlugIssueMessage(issue));
      }
      throw new Error(
        (errs.length && errs.join(", ")) || data.error || "collection_failed",
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
      await runDeployWalletAndConfirm({
        id,
        deployIntent,
        creatorAddress,
      });
    } else if (data.collection?.deployStatus === "confirmed") {
      setDeployNote("Collection contract ready (simulated or already deployed).");
    }

    const created = data.collection as CollectionOption | undefined;
    setCollectionId(id);
    // Pin the just-created row locally so later steps keep the same collectionId
    // even if the deployed mine list briefly omits it during refresh.
    setCollections((prev) => {
      if (prev.some((c) => c.id === id)) return prev;
      return [
        ...prev,
        {
          id,
          title: created?.title || titleFormat.title,
          slug: created?.slug || slugFormat.slug,
          chain: created?.chain || walletChain,
          network: created?.network || network,
          mediaBytes: created?.mediaBytes ?? 0,
          contractAddress: created?.contractAddress ?? null,
          deployStatus: created?.deployStatus ?? "confirmed",
        },
      ];
    });
    window.dispatchEvent(new Event("fm-collections-changed"));
    loadMine();
    return id;
  }

  async function uploadFiles(files: File[]) {
    setBusy(true);
    setError(null);
    setOk(null);
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

      // Greedy client-side cap so we don't hammer the API past quota.
      let budget = COLLECTION_MEDIA_CAP_BYTES - usedBytes;
      const queued: File[] = [];
      let skippedQuota = 0;
      for (const file of capped) {
        if (file.size > budget) {
          skippedQuota += 1;
          continue;
        }
        budget -= file.size;
        queued.push(file);
      }
      if (!queued.length) {
        throw new Error(
          skippedQuota
            ? "This collection is at the 10 GB art cap"
            : "No files selected",
        );
      }

      setUploadProgress({ current: 0, total: queued.length });
      let completed = 0;
      const settled = await mapPoolSettled(
        queued,
        UPLOAD_CONCURRENCY,
        async (file, index) => {
          const piece = await retryWithBackoff(
            async () => {
              const fd = new FormData();
              fd.set("file", file);
              fd.set("collectionId", id);
              const res = await fetch("/api/media/upload", {
                method: "POST",
                credentials: "include",
                body: fd,
              });
              let data: { error?: string; mediaUrl?: string; mediaHash?: string; size?: number } =
                {};
              try {
                data = await res.json();
              } catch {
                data = {};
              }
              if (res.status === 401) {
                throw makeHttpError("sign_in", 401);
              }
              if (!res.ok) {
                throw makeHttpError(
                  uploadErrorMessage(data.error),
                  res.status,
                );
              }
              if (!data.mediaUrl || !data.mediaHash) {
                throw makeHttpError("upload_failed", 502);
              }
              return {
                key: `${data.mediaHash}-${file.name}-${index}`,
                title: titleFromFile(file.name),
                description: "",
                fileName: file.name,
                mediaUrl: data.mediaUrl,
                mediaHash: data.mediaHash,
                size: Number(data.size ?? file.size),
                traits: [] as NftTrait[],
                maxSupply: dropKind === "limited" ? "1" : "",
              } satisfies Piece;
            },
            { retries: 3, baseDelayMs: 320, maxDelayMs: 3_500 },
          );
          completed += 1;
          setUploadProgress({ current: completed, total: queued.length });
          return piece;
        },
      );

      const okPieces = settled
        .filter((s): s is { ok: true; value: Piece; index: number } => s.ok)
        .sort((a, b) => a.index - b.index)
        .map((s) => s.value);
      const failed = settled.filter((s) => !s.ok);

      if (okPieces.length) {
        setPieces((current) =>
          batchUpload ? [...current, ...okPieces] : [okPieces[0]!],
        );
      }

      if (failed.length) {
        const sample = failed
          .slice(0, 3)
          .map((f) => ("error" in f ? f.error.message : "upload_failed"))
          .join("; ");
        const msg = `Uploaded ${okPieces.length} of ${queued.length} — ${failed.length} failed${sample ? ` (${sample})` : ""}. Retry the failed files.`;
        if (!okPieces.length) throw new Error(msg);
        setError(msg);
      } else if (skippedQuota) {
        setOk(
          `Uploaded ${okPieces.length}. ${skippedQuota} file${skippedQuota === 1 ? "" : "s"} skipped — collection is at the 10 GB art cap.`,
        );
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
      if (!collectionId) {
        const titleFormat = validateCollectionTitleFormat(newTitle);
        if (!titleFormat.ok) {
          setError(collectionTitleIssueMessage(titleFormat.issue));
          return;
        }
        if (titleStatus.checking) {
          setError("Still checking name availability…");
          return;
        }
        if (titleStatus.available === false) {
          setError(
            titleStatus.message ||
              collectionTitleIssueMessage(titleStatus.issue || "taken"),
          );
          return;
        }
        const slugFormat = validateCollectionSlugFormat(newSlug);
        if (!slugFormat.ok) {
          setError(collectionSlugIssueMessage(slugFormat.issue));
          return;
        }
        if (slugStatus.checking) {
          setError("Still checking URL availability…");
          return;
        }
        if (slugStatus.available === false) {
          setError(
            slugStatus.message ||
              collectionSlugIssueMessage(slugStatus.issue || "taken"),
          );
          return;
        }
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

      setListProgress({ current: 0, total: pieces.length });
      let listingsDone = 0;
      const listingSettled = await mapPoolSettled(
        pieces,
        LISTING_CONCURRENCY,
        async (item, index) => {
          const supply =
            intent === "drop" && dropKind === "limited" && item.maxSupply
              ? Number(item.maxSupply)
              : intent === "drop" && dropKind === "open" && item.maxSupply
                ? Number(item.maxSupply)
                : null;
          let type: "single" | "collection" | "open_edition" | "auction" =
            "single";
          if (intent === "auction") type = "auction";
          else if (intent === "drop") {
            type =
              dropKind === "open" || (supply != null && supply > 1)
                ? "open_edition"
                : "collection";
          }

          const listingId = await retryWithBackoff(
            async () => {
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
                        ? "Timed drop"
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
                  saleMode:
                    intent === "auction"
                      ? saleMode
                      : intent === "single"
                        ? "fixed"
                        : "fixed",
                  startingBidUsd:
                    intent === "auction" && saleMode === "english"
                      ? Number(startingBidUsd) || Number(price) || null
                      : null,
                  reserveUsd:
                    intent === "auction" && saleMode === "english" && reserveUsd
                      ? Number(reserveUsd)
                      : null,
                  publishSoftLaunch: false,
                }),
              });
              const data = await res.json();
              if (!res.ok) {
                throw makeHttpError(
                  (data.errors && data.errors.join(", ")) ||
                    data.error ||
                    "listing_failed",
                  res.status,
                );
              }
              const lid = String(data.listing?.id ?? data.id ?? "");
              if (!lid) throw makeHttpError("listing_failed", 502);
              return lid;
            },
            { retries: 3, baseDelayMs: 280, maxDelayMs: 3_000 },
          );
          listingsDone += 1;
          setListProgress({ current: listingsDone, total: pieces.length });
          return { index, listingId };
        },
      );

      const listingOk = listingSettled.filter(
        (s): s is { ok: true; value: { index: number; listingId: string }; index: number } =>
          s.ok,
      );
      const listingFail = listingSettled.filter((s) => !s.ok);
      if (listingFail.length) {
        const sample = listingFail
          .slice(0, 2)
          .map((f) => ("error" in f ? f.error.message : "listing_failed"))
          .join("; ");
        throw new Error(
          `Created ${listingOk.length} of ${pieces.length} listings — ${listingFail.length} failed${sample ? ` (${sample})` : ""}. Fix and retry mint; successful drafts were kept.`,
        );
      }
      const listingIds = listingOk
        .sort((a, b) => a.value.index - b.value.index)
        .map((s) => s.value.listingId);
      setListProgress(null);

      // Mint into the collection contract (creator pays gas).
      // Wallet-signed batches stay serial; confirms retry on transient errors.
      const creatorAddress = await requestBuyerAddress(
        network === "solana" ? "solana" : network === "boing" ? "boing" : "evm",
      );
      const mintPrep = await retryWithBackoff(
        async () => {
          const res = await fetch(`/api/collections/${id}/mint`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "prepare",
              listingIds,
              creatorAddress: creatorAddress || undefined,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            throw makeHttpError(data.error || "mint_prepare_failed", res.status);
          }
          return data as {
            batches?: Array<{
              listingIds: string[];
              provisionalTokenIds: string[];
              walletTx?: unknown;
              contractAddress?: string;
              txHash?: string;
              status?: string;
            }>;
          };
        },
        { retries: 2, baseDelayMs: 400, maxDelayMs: 3_000 },
      );
      const batches = mintPrep.batches ?? [];
      const mintTxHashes: string[] = [];
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
                `Wallet required to mint batch ${b + 1} of ${batches.length} (you pay gas). Earlier batches were confirmed — retry to finish the rest.`,
              );
            }
          } else if (!txHash) {
            txHash = `simulated-mint:${id}:${b}:${Date.now()}`;
          }
          await retryWithBackoff(
            async () => {
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
                throw makeHttpError(
                  confirmData.error || "mint_confirm_failed",
                  confirm.status,
                );
              }
            },
            { retries: 3, baseDelayMs: 400, maxDelayMs: 4_000 },
          );
          mintTxHashes.push(txHash);
          setMintProgress({ current: b + 1, total: batches.length });
        }
      }

      // Soft-launch only after mint confirms — keeps Open Lane buyable.
      const stageSettled = await mapPoolSettled(
        listingIds,
        STAGE_CONCURRENCY,
        async (listingId) => {
          await retryWithBackoff(
            async () => {
              const stageRes = await fetch(`/api/listings/${listingId}/stage`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ target: "soft_launch" }),
              });
              const stageData = await stageRes.json();
              if (!stageRes.ok) {
                const errs = Array.isArray(stageData.errors)
                  ? stageData.errors.join(", ")
                  : stageData.error;
                const message =
                  errs === "listing_not_minted" ||
                  (Array.isArray(stageData.errors) &&
                    stageData.errors.includes("listing_not_minted"))
                    ? "Mint must finish before soft-launch. Retry publish mint, then try again."
                    : errs || "soft_launch_failed";
                throw makeHttpError(message, stageRes.status);
              }
            },
            { retries: 2, baseDelayMs: 300, maxDelayMs: 2_500 },
          );
          return listingId;
        },
      );
      const stageFail = stageSettled.filter((s) => !s.ok);
      if (stageFail.length) {
        const sample = stageFail
          .slice(0, 2)
          .map((f) => ("error" in f ? f.error.message : "soft_launch_failed"))
          .join("; ");
        throw new Error(
          `Minted, but soft-launch failed for ${stageFail.length} of ${listingIds.length}${sample ? ` (${sample})` : ""}. Open the collection and retry staging for those pieces.`,
        );
      }

      const label =
        intent === "drop"
          ? `${pieces.length} ${dropKind === "open" ? "open-edition" : "limited"} piece${pieces.length === 1 ? "" : "s"}`
          : intent === "auction"
            ? "timed drop"
            : "1/1 listing";
      const publishedHero = pieces[0];
      setOk(null);
      const publishedCollection = collections.find((c) => c.id === id);
      setPublished({
        listingIds,
        collectionId: id,
        collectionSlug:
          publishedCollection?.slug ||
          slugStatus.normalized ||
          normalizeCollectionSlug(newSlug) ||
          null,
        label,
        collectionTitle:
          publishedCollection?.title ||
          newTitle.trim() ||
          "Untitled collection",
        network,
        intent,
        dropKind,
        priceUsd,
        pieceCount: pieces.length,
        heroTitle: publishedHero?.title ?? "",
        heroDescription: publishedHero?.description ?? "",
        heroMediaUrl: publishedHero?.mediaUrl ?? "",
        satelliteMediaUrls: pieces
          .slice(1, 4)
          .map((p) => p.mediaUrl)
          .filter(Boolean),
        styleTags,
        mintTxHashes,
      });
      setPieces([]);
      setMintProgress(null);
      setListProgress(null);
      router.refresh();
      window.dispatchEvent(new Event("fm-collections-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
      setMintProgress(null);
      setListProgress(null);
    }
  }

  const livePreview = published ? (
    <CreateLivePreview
      collectionTitle={published.collectionTitle}
      network={published.network}
      intent={published.intent}
      dropKind={published.dropKind}
      priceUsd={published.priceUsd}
      pieceCount={published.pieceCount}
      heroTitle={published.heroTitle}
      heroDescription={published.heroDescription}
      heroMediaUrl={published.heroMediaUrl}
      satelliteMediaUrls={published.satelliteMediaUrls}
      styleTags={published.styleTags}
      stepLabel="Published · live on FreshMint"
    />
  ) : (
    <CreateLivePreview
      collectionTitle={
        selected?.title || newTitle.trim() || "Untitled collection"
      }
      network={network}
      intent={intent}
      dropKind={dropKind}
      priceUsd={priceUsd}
      pieceCount={pieces.length}
      heroTitle={pieces[0]?.title ?? ""}
      heroDescription={pieces[0]?.description ?? ""}
      heroMediaUrl={pieces[0]?.mediaUrl ?? ""}
      satelliteMediaUrls={pieces
        .slice(1, 4)
        .map((p) => p.mediaUrl)
        .filter(Boolean)}
      styleTags={styleTags}
      stepLabel={`Create · ${stepIndex + 1} of ${steps.length} · ${step.label}`}
    />
  );

  if (published) {
    const firstId = published.listingIds[0];
    const explorerHashes = published.mintTxHashes.filter(isExplorableTxHash);
    const collectionHref = collectionPath({
      id: published.collectionId,
      slug: published.collectionSlug,
    });
    return (
      <WizardShell preview={livePreview}>
        <PublishConfetti active />
        <div className="create-wizard">
          <div className="create-wizard__panel create-wizard__panel--bare create-wizard__panel--success">
            <h2 className="display create-wizard__title">Published on-chain</h2>
            <p className="create-wizard__lead">
              {published.label} is minted and live. Your first work auto-enters
              Rising so collectors can find it without a Featured pin. Later works
              wait out the new-wallet cooldown and weekly cap.
            </p>
            <div className="create-wizard__success-links" aria-label="Published links">
              <Link href={collectionHref} className="badge featured">
                View collection
              </Link>
              {firstId ? (
                <Link href={`/listings/${firstId}`} className="badge">
                  Open listing
                </Link>
              ) : null}
              <Link href="/rising" className="badge emerging">
                Rising
              </Link>
              <Link href="/me" className="badge">
                Your works
              </Link>
            </div>
            {explorerHashes.length ? (
              <div className="create-wizard__tx-links">
                <p className="create-wizard__hint">
                  On-chain mint
                  {explorerHashes.length === 1 ? "" : " batches"} ·{" "}
                  {published.network}
                </p>
                <ul>
                  {explorerHashes.map((hash, i) => (
                    <li key={`${hash}-${i}`}>
                      <TxExplorerLink
                        hash={hash}
                        network={published.network}
                        label={
                          explorerHashes.length > 1
                            ? `Batch ${i + 1} · ${hash.slice(0, 10)}…`
                            : undefined
                        }
                        className="create-wizard__tx-link"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="create-wizard__nav">
              <button
                type="button"
                className="fm-btn fm-btn--primary"
                onClick={() => {
                  setPublished(null);
                  setStepIndex(0);
                  setIntent(null);
                  setOk(null);
                }}
              >
                Create another
              </button>
            </div>
          </div>
        </div>
      </WizardShell>
    );
  }

  return (
    <WizardShell preview={livePreview}>
    <div className="create-wizard">
      <div className="create-wizard__progress" aria-hidden="true">
        {steps.map((s, index) => (
          <span
            key={s.id}
            className={
              index <= stepIndex
                ? "create-wizard__progress-seg is-on"
                : "create-wizard__progress-seg"
            }
          />
        ))}
      </div>
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

      <div className="create-wizard__panel create-wizard__panel--bare create-wizard__panel--rise" key={step.id}>
        {step.id === "intent" ? (
          <>
            <h2 className="display create-wizard__title">What are you creating?</h2>
            <p className="create-wizard__lead">
              One path at a time — a collection drop, a single 1/1, or a timed
              drop (timed window).
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
                    title: "Timed drop",
                    body: "Choose timed window (buy at list price) or English auction (open bidding) on the schedule step.",
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
                    setSaleMode(
                      choice.id === "auction"
                        ? "timed_window"
                        : choice.id === "single"
                          ? "fixed"
                          : "fixed",
                    );
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
                    const id = e.target.value;
                    setCollectionId(id);
                    if (id) {
                      setNewTitle("");
                      const chosen = networkCollections.find((c) => c.id === id);
                      const net = chosen ? collectionNetworkOf(chosen) : "";
                      if (
                        net === "ethereum" ||
                        net === "base" ||
                        net === "arbitrum" ||
                        net === "optimism" ||
                        net === "solana" ||
                        net === "boing"
                      ) {
                        setNetwork(net);
                      }
                    }
                  }}
                  className="fm-field"
                >
                  <option value="">Create one below…</option>
                  {networkCollections.map((c) => (
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
                  className="fm-field"
                  disabled={Boolean(collectionId)}
                  aria-describedby="create-collection-title-status"
                />
                {!collectionId ? (
                  <p
                    id="create-collection-title-status"
                    className="create-wizard__hint"
                    role="status"
                    aria-live="polite"
                    style={{
                      marginTop: "0.4rem",
                      color:
                        titleStatus.available === true
                          ? "var(--emergent)"
                          : titleStatus.available === false
                            ? "var(--danger)"
                            : "var(--ink-muted)",
                    }}
                  >
                    {titleStatus.message ||
                      "Must be unique across all networks (case-insensitive)."}
                  </p>
                ) : null}
              </label>
            </div>
            {!collectionId ? (
              <label>
                Collection URL
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    marginTop: "0.35rem",
                  }}
                >
                  <span
                    style={{
                      color: "var(--ink-muted)",
                      fontSize: "0.88rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    /collections/
                  </span>
                  <input
                    value={newSlug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setCollectionId("");
                      setNewSlug(sanitizeCollectionSlugInput(e.target.value));
                    }}
                    placeholder="dawn-set"
                    maxLength={48}
                    autoComplete="off"
                    spellCheck={false}
                    className="fm-field fm-field--flush"
                    aria-describedby="create-collection-slug-status"
                  />
                </div>
                <p
                  id="create-collection-slug-status"
                  className="create-wizard__hint"
                  role="status"
                  aria-live="polite"
                  style={{
                    marginTop: "0.4rem",
                    color:
                      slugStatus.available === true
                        ? "var(--emergent)"
                        : slugStatus.available === false
                          ? "var(--danger)"
                          : "var(--ink-muted)",
                  }}
                >
                  {slugStatus.message ||
                    "Lowercase letters, numbers, and hyphens. Must be unique."}
                </p>
              </label>
            ) : null}
            {!collectionId ? (
              <fieldset
                className="create-wizard__profile-fields"
                style={{
                  margin: 0,
                  padding: 0,
                  border: "none",
                  display: "grid",
                  gap: "0.75rem",
                }}
              >
                <legend
                  style={{
                    padding: 0,
                    color: "var(--ink-muted)",
                    fontSize: "0.88rem",
                  }}
                >
                  Collection profile (optional)
                </legend>
                <label>
                  Description
                  <textarea
                    value={collectionDescription}
                    onChange={(e) => setCollectionDescription(e.target.value)}
                    maxLength={2000}
                    rows={2}
                    placeholder="About this collection"
                    className="fm-field"
                  />
                </label>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    alignItems: "center",
                  }}
                >
                  <label className="badge" style={{ cursor: "pointer" }}>
                    {profileUploadBusy ? "Uploading…" : "Upload logo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      hidden
                      disabled={profileUploadBusy}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        setProfileUploadBusy(true);
                        setError(null);
                        try {
                          const fd = new FormData();
                          fd.set("file", file);
                          const upload = await fetch("/api/media/upload", {
                            method: "POST",
                            credentials: "include",
                            body: fd,
                          });
                          const data = (await upload.json()) as {
                            mediaUrl?: string;
                            error?: string;
                          };
                          if (!upload.ok || !data.mediaUrl) {
                            throw new Error(data.error || "upload_failed");
                          }
                          setCollectionImageUrl(data.mediaUrl);
                        } catch (err) {
                          setError(
                            err instanceof Error ? err.message : "upload_failed",
                          );
                        } finally {
                          setProfileUploadBusy(false);
                        }
                      }}
                    />
                  </label>
                  <label className="badge" style={{ cursor: "pointer" }}>
                    Upload banner
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      hidden
                      disabled={profileUploadBusy}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        setProfileUploadBusy(true);
                        setError(null);
                        try {
                          const fd = new FormData();
                          fd.set("file", file);
                          const upload = await fetch("/api/media/upload", {
                            method: "POST",
                            credentials: "include",
                            body: fd,
                          });
                          const data = (await upload.json()) as {
                            mediaUrl?: string;
                            error?: string;
                          };
                          if (!upload.ok || !data.mediaUrl) {
                            throw new Error(data.error || "upload_failed");
                          }
                          setCollectionBannerUrl(data.mediaUrl);
                        } catch (err) {
                          setError(
                            err instanceof Error ? err.message : "upload_failed",
                          );
                        } finally {
                          setProfileUploadBusy(false);
                        }
                      }}
                    />
                  </label>
                  {collectionImageUrl ? (
                    <span className="badge emerging">Logo set</span>
                  ) : null}
                  {collectionBannerUrl ? (
                    <span className="badge emerging">Banner set</span>
                  ) : null}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.65rem",
                  }}
                >
                  <label>
                    Website
                    <input
                      value={collectionWebsiteUrl}
                      onChange={(e) => setCollectionWebsiteUrl(e.target.value)}
                      placeholder="https://"
                      className="fm-field"
                      inputMode="url"
                    />
                  </label>
                  <label>
                    X / Twitter
                    <input
                      value={collectionTwitterUrl}
                      onChange={(e) => setCollectionTwitterUrl(e.target.value)}
                      placeholder="https://x.com/…"
                      className="fm-field"
                      inputMode="url"
                    />
                  </label>
                  <label>
                    Discord
                    <input
                      value={collectionDiscordUrl}
                      onChange={(e) => setCollectionDiscordUrl(e.target.value)}
                      placeholder="https://discord.gg/…"
                      className="fm-field"
                      inputMode="url"
                    />
                  </label>
                  <label>
                    Instagram
                    <input
                      value={collectionInstagramUrl}
                      onChange={(e) =>
                        setCollectionInstagramUrl(e.target.value)
                      }
                      placeholder="https://instagram.com/…"
                      className="fm-field"
                      inputMode="url"
                    />
                  </label>
                </div>
              </fieldset>
            ) : null}
            <label>
              Mint network
              <select
                value={network}
                onChange={(e) => {
                  setNetwork(e.target.value);
                  setCollectionId("");
                }}
                className="fm-field"
              >
                <option value="ethereum">Ethereum (Sepolia)</option>
                <option value="base">Base (Sepolia)</option>
                <option value="arbitrum">Arbitrum (Sepolia)</option>
                <option value="optimism">Optimism (Sepolia)</option>
                <option value="solana">Solana (Devnet)</option>
                <option value="boing">Boing Testnet</option>
              </select>
            </label>
            <p className="create-wizard__lead" style={{ marginTop: "0.75rem" }}>
              Existing collections list only sets you own on{" "}
              <strong>{network}</strong> that are already deployed on-chain.
              Create a new title below to deploy a fresh contract.
            </p>
          </>
        ) : null}

        {step.id === "schedule" ? (
          <>
            <h2 className="display create-wizard__title">
              {intent === "auction"
                ? saleMode === "english"
                  ? "English auction window"
                  : "Timed drop window"
                : "Drop schedule"}
            </h2>
            <p className="create-wizard__lead">
              {saleMode === "english"
                ? "Collectors place open USD bids while the window is live. Winner claims at the high bid."
                : "Collectors pay crypto at this USD-quoted price while the window is live."}
            </p>
            {intent === "auction" ? (
              <div className="drop-studio__kinds" role="group" aria-label="Sale mode">
                <button
                  type="button"
                  className={saleMode === "timed_window" ? "is-active" : undefined}
                  aria-pressed={saleMode === "timed_window"}
                  onClick={() => setSaleMode("timed_window")}
                >
                  Timed window (buy at list price)
                </button>
                <button
                  type="button"
                  className={saleMode === "english" ? "is-active" : undefined}
                  aria-pressed={saleMode === "english"}
                  onClick={() => setSaleMode("english")}
                >
                  English auction (open bidding)
                </button>
              </div>
            ) : null}
            {intent === "auction" && saleMode === "english" ? (
              <div className="create-wizard__grid-2" style={{ marginTop: "0.75rem" }}>
                <label>
                  Starting bid (USD)
                  <input
                    value={startingBidUsd}
                    onChange={(e) => setStartingBidUsd(e.target.value)}
                    className="fm-field"
                  />
                </label>
                <label>
                  Reserve (USD, optional)
                  <input
                    value={reserveUsd}
                    onChange={(e) => setReserveUsd(e.target.value)}
                    className="fm-field"
                  />
                </label>
              </div>
            ) : null}
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
                  className="fm-field"
                />
              </label>
              <label>
                Ends
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="fm-field"
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
                  className="fm-field"
                />
                <span style={{ display: "block", marginTop: "0.35rem" }}>
                  <PlatformFeeBreakdown
                    priceUsd={Number(priceUsd) > 0 ? Number(priceUsd) : null}
                    compact
                  />
                </span>
              </label>
            </div>
          </>
        ) : null}

        {step.id === "artwork" ? (
          <>
            <h2 className="display create-wizard__title">Upload artwork</h2>
            <p className="create-wizard__lead">
              {batchUpload
                ? "Select many files at once (Shift or Ctrl/Cmd click). Up to 100 MB each, 10 GB per collection. The live preview updates as files land."
                : "Upload one file for this listing — the live preview updates as soon as it is ready."}
            </p>
            <label>
              {batchUpload ? "Artwork files" : "Artwork file"}
              <input
                type="file"
                multiple={batchUpload}
                accept={ACCEPT}
                disabled={busy}
                className="fm-field"
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
                    className="fm-field"
                  />
                  <span style={{ display: "block", marginTop: "0.35rem" }}>
                    <PlatformFeeBreakdown
                      priceUsd={Number(priceUsd) > 0 ? Number(priceUsd) : null}
                      compact
                    />
                  </span>
                </label>
                <label>
                  Medium
                  <input
                    value={medium}
                    onChange={(e) => setMedium(e.target.value)}
                    className="fm-field"
                  />
                </label>
              </div>
            ) : (
              <label>
                Medium
                <input
                  value={medium}
                  onChange={(e) => setMedium(e.target.value)}
                  className="fm-field"
                />
              </label>
            )}
            <label>
              Style tags (comma-separated)
              <input
                value={styleTags}
                onChange={(e) => setStyleTags(e.target.value)}
                placeholder="ink, minimal"
                className="fm-field"
              />
            </label>
            {batchUpload ? (
              <div>
                <label>
                  Traits CSV (OpenSea-style)
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="fm-field"
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
                          className="fm-field"
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
                          className="fm-field"
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
                            className="fm-field"
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
            <h2 className="display create-wizard__title">Mint & publish</h2>
            <p className="create-wizard__lead">
              Minting at publish is required to sell. Unminted drafts stay off
              the market and show as “Not minted yet” to collectors.
            </p>
            <ol className="create-wizard__mint-checklist" aria-label="Mint checklist">
              <li>
                <strong>Deploy collection</strong> — confirmed on your mint network
                (done if you already deployed).
              </li>
              <li>
                <strong>Mint pieces</strong> — you pay gas; tokens land in the
                collection contract.
              </li>
              <li>
                <strong>Soft-launch</strong> — only after mint confirms, so Open
                Lane buys can transfer the NFT.
              </li>
            </ol>
            <p
              style={{
                margin: "0 0 1rem",
                color: "var(--ink-muted)",
                fontSize: "0.9rem",
                maxWidth: "46ch",
              }}
            >
              Progress shows below while mint batches run — finish this step
              before sharing the listing.
            </p>
            <dl className="create-wizard__summary">
              <div>
                <dt>Type</dt>
                <dd>
                  {intent === "drop"
                    ? `${dropKind === "open" ? "Open" : "Limited"} edition drop`
                    : intent === "auction"
                      ? "Timed drop"
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
                <dd>
                  ${priceUsd}
                  <div style={{ marginTop: "0.35rem" }}>
                    <PlatformFeeBreakdown
                      priceUsd={Number(priceUsd) > 0 ? Number(priceUsd) : null}
                      compact
                    />
                  </div>
                </dd>
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
        {listProgress ? (
          <p style={{ color: "var(--ink)", margin: "0.75rem 0 0" }} aria-live="polite">
            Creating listings {listProgress.current} of {listProgress.total}…
          </p>
        ) : null}
        {mintProgress ? (
          <p style={{ color: "var(--ink)", margin: "0.75rem 0 0" }} aria-live="polite">
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
            className="fm-btn fm-btn--ghost"
            disabled={busy || stepIndex === 0}
            style={{ opacity: stepIndex === 0 ? 0.4 : 1 }}
            onClick={goBack}
          >
            Back
          </button>
          {step.id !== "review" ? (
            <button
              type="button"
              className="fm-btn fm-btn--primary"
              disabled={busy}
              onClick={() => void advance()}
            >
              {busy ? "Working…" : "Continue"}
            </button>
          ) : (
            <button
              type="button"
              className="fm-btn fm-btn--primary"
              disabled={busy}
              onClick={() => void publish()}
            >
              {busy
                ? mintProgress
                  ? `Minting ${mintProgress.current}/${mintProgress.total}…`
                  : listProgress
                    ? `Listings ${listProgress.current}/${listProgress.total}…`
                    : "Minting & publishing…"
                : "Mint & publish (required to sell)"}
            </button>
          )}
        </div>
      </div>
    </div>
    </WizardShell>
  );
}
