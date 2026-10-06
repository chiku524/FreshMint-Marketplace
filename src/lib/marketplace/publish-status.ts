/**
 * Creator-facing publish lifecycle: Draft → Deploy → Mint → Live.
 * Surfaces where the collection/NFT is so “contract not found” style
 * ambiguity is replaced with an explicit current step.
 */

export type PublishPhaseId = "draft" | "deploy" | "mint" | "live";

export type PublishStepStatus = "done" | "current" | "upcoming" | "failed";

export type PublishLifecycleStep = {
  id: PublishPhaseId;
  label: string;
  short: string;
  status: PublishStepStatus;
  detail: string;
};

export type PublishLifecycleSnapshot = {
  current: PublishPhaseId;
  steps: PublishLifecycleStep[];
  /** One-line status for creators. */
  summary: string;
};

const PHASE_ORDER: PublishPhaseId[] = ["draft", "deploy", "mint", "live"];

const LABELS: Record<PublishPhaseId, { label: string; short: string }> = {
  draft: { label: "Draft", short: "Draft" },
  deploy: { label: "Deploy on-chain", short: "Deploy" },
  mint: { label: "Mint", short: "Mint" },
  live: { label: "Live", short: "Live" },
};

export function isListingMinted(listing: {
  tokenId?: string | null;
  contractAddress?: string | null;
  mintTxHash?: string | null;
}): boolean {
  return Boolean(
    listing.tokenId && listing.contractAddress && listing.mintTxHash,
  );
}

export function isCollectionDeployed(collection: {
  deployStatus?: string | null;
  contractAddress?: string | null;
}): boolean {
  if (collection.deployStatus === "failed") return false;
  if (collection.deployStatus === "confirmed") {
    const addr = collection.contractAddress ?? "";
    return Boolean(addr) && !addr.startsWith("pending:");
  }
  return false;
}

function stepStatuses(
  current: PublishPhaseId,
  failedPhase: PublishPhaseId | null,
): Record<PublishPhaseId, PublishStepStatus> {
  const currentIdx = PHASE_ORDER.indexOf(current);
  const out = {} as Record<PublishPhaseId, PublishStepStatus>;
  for (let i = 0; i < PHASE_ORDER.length; i++) {
    const id = PHASE_ORDER[i]!;
    if (failedPhase === id) {
      out[id] = "failed";
    } else if (i < currentIdx) {
      out[id] = "done";
    } else if (i === currentIdx) {
      out[id] = failedPhase ? "upcoming" : "current";
    } else {
      out[id] = "upcoming";
    }
  }
  if (failedPhase) {
    out[failedPhase] = "failed";
    // Mark the failed phase as the visual focus.
    for (const id of PHASE_ORDER) {
      if (id !== failedPhase && out[id] === "current") out[id] = "upcoming";
    }
  }
  return out;
}

export type CollectionPublishInput = {
  deployStatus?: string | null;
  contractAddress?: string | null;
  /** Draft / unminted / minted counts for owner rail. */
  draftCount: number;
  mintedDraftCount: number;
  unmintedDraftCount: number;
  /** Pieces already soft-launched (live). */
  liveCount: number;
  /** Optional in-progress override while a wallet action runs. */
  busyPhase?: PublishPhaseId | null;
  failedPhase?: PublishPhaseId | null;
  /** Extra detail for the current/failed step (RPC message, etc.). */
  progressNote?: string | null;
};

/**
 * Build step indicators for a collection publish rail / create wizard.
 */
export function buildCollectionPublishLifecycle(
  input: CollectionPublishInput,
): PublishLifecycleSnapshot {
  const deployed = isCollectionDeployed(input);
  const deployFailed = input.deployStatus === "failed";
  const deployPending = input.deployStatus === "pending_wallet";

  let current: PublishPhaseId = "draft";
  if (input.busyPhase) {
    current = input.busyPhase;
  } else if (input.liveCount > 0 && input.draftCount === 0) {
    current = "live";
  } else if (input.mintedDraftCount > 0 && input.unmintedDraftCount === 0) {
    // All drafts minted — waiting on soft-launch.
    current = "live";
  } else if (deployed && input.unmintedDraftCount > 0) {
    current = "mint";
  } else if (deployed && input.draftCount === 0 && input.liveCount > 0) {
    current = "live";
  } else if (deployed) {
    current = input.unmintedDraftCount > 0 ? "mint" : "live";
  } else if (deployPending || input.draftCount > 0) {
    current = deployPending ? "deploy" : "draft";
  }

  // New collection before drafts: still draft until something exists.
  if (
    !input.busyPhase &&
    input.draftCount === 0 &&
    input.liveCount === 0 &&
    !deployed
  ) {
    current = "draft";
  }

  const failedPhase =
    input.failedPhase ?? (deployFailed ? ("deploy" as const) : null);
  const statuses = stepStatuses(current, failedPhase);

  const deployDetail = deployFailed
    ? "Deploy failed — retry from Mint & publish"
    : deployPending
      ? "Waiting on wallet confirm…"
      : deployed
        ? input.contractAddress
          ? `Contract ${input.contractAddress.slice(0, 10)}…`
          : "Contract confirmed"
        : "Collection contract not on-chain yet";

  const mintDetail =
    input.unmintedDraftCount > 0
      ? `${input.unmintedDraftCount} draft${input.unmintedDraftCount === 1 ? "" : "s"} need mint`
      : input.mintedDraftCount > 0
        ? `${input.mintedDraftCount} minted — ready to soft-launch`
        : input.liveCount > 0
          ? "Pieces minted"
          : "Mint after deploy confirms";

  const liveDetail =
    input.liveCount > 0
      ? `${input.liveCount} live on Open Lane`
      : input.mintedDraftCount > 0
        ? "Minted drafts still private — soft-launch to go live"
        : "Live after mint confirms";

  const details: Record<PublishPhaseId, string> = {
    draft:
      input.draftCount > 0
        ? `${input.draftCount} private draft${input.draftCount === 1 ? "" : "s"}`
        : input.liveCount > 0
          ? "Drafts finished"
          : "Artwork saved as draft before deploy",
    deploy: deployDetail,
    mint: mintDetail,
    live: liveDetail,
  };

  if (input.progressNote?.trim()) {
    details[current] = input.progressNote.trim();
    if (failedPhase) details[failedPhase] = input.progressNote.trim();
  }

  const steps: PublishLifecycleStep[] = PHASE_ORDER.map((id) => ({
    id,
    label: LABELS[id].label,
    short: LABELS[id].short,
    status: statuses[id],
    detail: details[id],
  }));

  let summary: string;
  if (failedPhase === "deploy") {
    summary =
      input.progressNote?.trim() ||
      "Deploy step failed — approve re-deploy in your wallet, then mint again.";
  } else if (current === "draft") {
    summary = "Draft saved. Next: deploy the collection contract on your mint network.";
  } else if (current === "deploy") {
    summary =
      input.progressNote?.trim() ||
      "Deploy in progress — confirm in your wallet, then FreshMint links the contract.";
  } else if (current === "mint") {
    summary =
      input.progressNote?.trim() ||
      "Contract is on-chain. Mint pieces (you pay gas), then they can go live.";
  } else if (input.mintedDraftCount > 0 && input.liveCount === 0) {
    summary = "Minted and ready — soft-launch to appear on Open Lane.";
  } else {
    summary = "Live on FreshMint — collectors can find and buy.";
  }

  return { current, steps, summary };
}

export type ListingPublishInput = {
  stage: string;
  delisted?: boolean;
  tokenId?: string | null;
  contractAddress?: string | null;
  mintTxHash?: string | null;
  collectionDeployStatus?: string | null;
  collectionContractAddress?: string | null;
};

/** Per-listing publish position (NFT page owner hint / create flow). */
export function buildListingPublishLifecycle(
  input: ListingPublishInput,
): PublishLifecycleSnapshot {
  const minted = isListingMinted(input);
  const deployed = isCollectionDeployed({
    deployStatus: input.collectionDeployStatus ?? (minted ? "confirmed" : "none"),
    contractAddress:
      input.collectionContractAddress ?? input.contractAddress ?? null,
  });
  const live =
    !input.delisted &&
    input.stage !== "draft" &&
    minted;

  let current: PublishPhaseId = "draft";
  if (live) current = "live";
  else if (minted) current = "live"; // minted draft → treat current focus as live/soft-launch
  else if (deployed) current = "mint";
  else current = input.stage === "draft" ? "draft" : "deploy";

  // Minted but still draft: highlight Live as current (needs soft-launch).
  if (minted && input.stage === "draft") {
    current = "live";
  }

  const statuses = stepStatuses(current, null);
  if (minted && input.stage === "draft") {
    statuses.draft = "done";
    statuses.deploy = "done";
    statuses.mint = "done";
    statuses.live = "current";
  }

  const steps: PublishLifecycleStep[] = PHASE_ORDER.map((id) => {
    let detail = "";
    if (id === "draft") {
      detail =
        input.stage === "draft" && !minted
          ? "Private draft"
          : "Draft recorded";
    } else if (id === "deploy") {
      detail = deployed
        ? "Collection contract confirmed"
        : "Waiting for on-chain collection deploy";
    } else if (id === "mint") {
      detail = minted
        ? input.tokenId
          ? `Token ${input.tokenId}`
          : "Minted on-chain"
        : "Not minted yet";
    } else {
      detail = live
        ? "On Open Lane"
        : minted
          ? "Minted — soft-launch to go live"
          : "Not live yet";
    }
    return {
      id,
      label: LABELS[id].label,
      short: LABELS[id].short,
      status: statuses[id],
      detail,
    };
  });

  const summary = live
    ? "This work is live."
    : minted && input.stage === "draft"
      ? "Minted draft — soft-launch to appear on Open Lane."
      : deployed
        ? "Deployed — mint required before collectors can buy."
        : "Draft — deploy and mint before this can go live.";

  return { current, steps, summary };
}

/** Map wizard progress strings into a busy phase for the stepper. */
export function wizardBusyPhase(input: {
  listProgress: boolean;
  deployNote: string | null;
  mintProgress: boolean;
  published: boolean;
}): PublishPhaseId | null {
  if (input.published) return "live";
  if (input.mintProgress) return "mint";
  if (input.deployNote) return "deploy";
  if (input.listProgress) return "draft";
  return null;
}
