"use client";

import { PublishLifecycleStatus } from "@/components/PublishLifecycleStatus";
import { formatBoingMintUserMessage } from "@/lib/onchain/boing-messages";
import {
  buildCollectionPublishLifecycle,
  type PublishPhaseId,
} from "@/lib/marketplace/publish-status";
import {
  maybeSendWalletTx,
  requestBuyerAddress,
  sendBoingMintWalletTx,
  sendBoingWalletTxDetailed,
  sendEvmWalletTx,
  type BoingWalletTx,
  type EvmWalletTx,
} from "@/lib/onchain/wallet-client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type DraftPiece = {
  id: string;
  title: string;
  minted: boolean;
};

function mintPublishErrorMessage(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "mint_failed";
  if (
    /account not found|boing_|collection_not_deployed|onchain_deploy|probe_unknown/i.test(
      trimmed,
    )
  ) {
    return formatBoingMintUserMessage(trimmed);
  }
  return trimmed;
}

function isMissingContractError(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  return (
    t === "boing_collection_account_missing" ||
    t.includes("contract was not found") ||
    (t.includes("account not found") && !t.includes("creator"))
  );
}

export function CollectionPublishPanel({
  collectionId,
  network,
  drafts,
  deployStatus = "none",
  contractAddress = null,
  liveCount = 0,
}: {
  collectionId: string;
  network: string;
  drafts: DraftPiece[];
  deployStatus?: string | null;
  contractAddress?: string | null;
  liveCount?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [busyPhase, setBusyPhase] = useState<PublishPhaseId | null>(null);
  const [failedPhase, setFailedPhase] = useState<PublishPhaseId | null>(null);

  const mintedDrafts = drafts.filter((d) => d.minted);
  const unmintedDrafts = drafts.filter((d) => !d.minted);

  const lifecycle = useMemo(
    () =>
      buildCollectionPublishLifecycle({
        deployStatus,
        contractAddress,
        draftCount: drafts.length,
        mintedDraftCount: mintedDrafts.length,
        unmintedDraftCount: unmintedDrafts.length,
        liveCount,
        busyPhase: busy ? busyPhase : null,
        failedPhase,
        // Keep live progress in the rail; failure copy renders once below.
        progressNote: progress,
      }),
    [
      deployStatus,
      contractAddress,
      drafts.length,
      mintedDrafts.length,
      unmintedDrafts.length,
      liveCount,
      busy,
      busyPhase,
      failedPhase,
      progress,
    ],
  );

  if (drafts.length === 0) return null;

  async function softLaunchMinted() {
    setBusy(true);
    setBusyPhase("live");
    setFailedPhase(null);
    setMsg(null);
    setProgress("Publishing minted drafts…");
    try {
      const res = await fetch(`/api/collections/${collectionId}/publish`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "soft_launch_minted" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "publish_failed");
      }
      const n = Array.isArray(data.softLaunched) ? data.softLaunched.length : 0;
      setMsg(
        n > 0
          ? `Published ${n} minted piece${n === 1 ? "" : "s"} to Open Lane.`
          : "No minted drafts left to publish.",
      );
      router.refresh();
    } catch (err) {
      setFailedPhase("live");
      setMsg(err instanceof Error ? err.message : "publish_failed");
    } finally {
      setBusy(false);
      setBusyPhase(null);
      setProgress(null);
    }
  }

  /** Sync or force wallet re-deploy when the stored Boing contract AccountId is dead. */
  async function ensureBoingCollectionDeploy(
    creatorAddress: string | null,
  ): Promise<void> {
    setBusyPhase("deploy");
    setProgress("Checking collection deploy…");
    const sync = await fetch(`/api/collections/${collectionId}/deploy`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sync",
        creatorAddress: creatorAddress || undefined,
      }),
    });
    const syncData = await sync.json().catch(() => ({}));
    if (sync.ok) return;

    const syncErr = String(syncData.error || "");
    if (
      syncErr !== "boing_collection_account_missing" &&
      syncErr !== "onchain_deploy_not_found"
    ) {
      // Soft fail — mint prepare still validates.
      return;
    }

    setProgress("Collection contract missing on Boing — preparing re-deploy…");
    const prep = await fetch(`/api/collections/${collectionId}/deploy`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "prepare",
        forceRedeploy: true,
        creatorAddress: creatorAddress || undefined,
      }),
    });
    const prepData = await prep.json();
    if (!prep.ok) {
      throw new Error(
        mintPublishErrorMessage(String(prepData.error || "deploy_prepare_failed")),
      );
    }
    if (prepData.alreadyDeployed || !prepData.deployIntent?.walletTx) {
      return;
    }

    const deployIntent = prepData.deployIntent as {
      contractAddress?: string;
      escrowAddress?: string;
      nftTemplateVersion?: string;
      walletTx: unknown;
    };
    setProgress("Confirm collection re-deploy in your wallet (you pay gas)…");
    const wt = deployIntent.walletTx as EvmWalletTx | BoingWalletTx;
    let txHash: string | null = null;
    /** Only a wallet-returned AccountId — never the FreshMint provisional placeholder. */
    let walletContractAddress: string | undefined;

    if (wt.chain === "evm") {
      txHash = await sendEvmWalletTx(wt);
    } else if (wt.chain === "boing") {
      const sent = await sendBoingWalletTxDetailed(wt);
      if (sent.contractAddress) walletContractAddress = sent.contractAddress;

      // Always link from chain after wallet accept (mempool "ok" or real tx id).
      // Never confirm a provisional placeholder — that recreated the missing-contract loop.
      const linkTxHash =
        sent.txHash && /^0x[0-9a-fA-F]{64}$/.test(sent.txHash)
          ? sent.txHash
          : `pending:boing-accepted:${Date.now().toString(16)}`;
      if (!sent.txHash && !sent.mempoolAccepted) {
        throw new Error(mintPublishErrorMessage("boing_tx_id_required"));
      }
      setProgress("Wallet accepted deploy — linking contract from chain…");
      let lastError = "onchain_deploy_not_found";
      for (let attempt = 0; attempt < 12; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 2000));
        }
        const retrySync = await fetch(
          `/api/collections/${collectionId}/deploy`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "sync",
              creatorAddress: creatorAddress || undefined,
              contractAddress: walletContractAddress || undefined,
              txHash: linkTxHash,
            }),
          },
        );
        const retryData = await retrySync.json();
        if (retrySync.ok && retryData.collection?.contractAddress) {
          setProgress(
            `Collection re-deployed · ${String(retryData.collection.contractAddress).slice(0, 10)}…`,
          );
          return;
        }
        lastError = retryData.error || lastError;
      }
      throw new Error(
        mintPublishErrorMessage(
          lastError === "onchain_deploy_not_found" ||
            lastError === "boing_contract_unresolved"
            ? "Deploy landed in the wallet but FreshMint could not link the contract yet — wait a few seconds and retry Mint & publish"
            : lastError,
        ),
      );
    } else {
      txHash = await maybeSendWalletTx({
        walletTx: deployIntent.walletTx,
        listingId: collectionId,
        action: "mint",
      });
    }

    if (!txHash) {
      throw new Error(
        "Wallet required to re-deploy the collection contract on Boing",
      );
    }

    const confirm = await fetch(`/api/collections/${collectionId}/deploy`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        txHash,
        contractAddress: walletContractAddress || undefined,
        escrowAddress: deployIntent.escrowAddress,
        creatorAddress: creatorAddress || undefined,
        nftTemplateVersion: deployIntent.nftTemplateVersion,
      }),
    });
    const confirmData = await confirm.json();
    if (!confirm.ok) {
      throw new Error(
        mintPublishErrorMessage(
          String(confirmData.error || "deploy_confirm_failed"),
        ),
      );
    }
  }

  async function mintAndPublishRemaining() {
    setBusy(true);
    setFailedPhase(null);
    setMsg(null);
    let phase: PublishPhaseId = "mint";
    try {
      const listingIds = unmintedDrafts.map((d) => d.id);
      if (!listingIds.length) {
        setMsg("Nothing left to mint — try Soft-launch minted drafts.");
        return;
      }
      const chainVm =
        network === "solana" ? "solana" : network === "boing" ? "boing" : "evm";
      const creatorAddress = await requestBuyerAddress(chainVm);

      if (network === "boing") {
        phase = "deploy";
        setBusyPhase("deploy");
        await ensureBoingCollectionDeploy(creatorAddress);
      }

      phase = "mint";
      setBusyPhase("mint");
      setProgress("Preparing mint batches…");
      let prep = await fetch(`/api/collections/${collectionId}/mint`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          listingIds,
          creatorAddress: creatorAddress || undefined,
        }),
      });
      let prepData = await prep.json();

      // If prepare still sees a dead contract, force re-deploy once then retry.
      if (
        !prep.ok &&
        network === "boing" &&
        isMissingContractError(String(prepData.error || ""))
      ) {
        phase = "deploy";
        setBusyPhase("deploy");
        await ensureBoingCollectionDeploy(creatorAddress);
        phase = "mint";
        setBusyPhase("mint");
        setProgress("Preparing mint batches…");
        prep = await fetch(`/api/collections/${collectionId}/mint`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "prepare",
            listingIds,
            creatorAddress: creatorAddress || undefined,
          }),
        });
        prepData = await prep.json();
      }

      if (!prep.ok) {
        throw new Error(
          mintPublishErrorMessage(String(prepData.error || "mint_prepare_failed")),
        );
      }
      const batches = (prepData.batches ?? []) as Array<{
        listingIds: string[];
        provisionalTokenIds: string[];
        walletTx?: unknown;
        contractAddress?: string;
        txHash?: string;
      }>;
      if (!batches.length) {
        setMsg(
          prepData.alreadyMinted
            ? "Already minted — soft-launching…"
            : "No mint batches needed.",
        );
        await softLaunchMinted();
        return;
      }

      for (let b = 0; b < batches.length; b++) {
        const batch = batches[b]!;
        setProgress(`Minting batch ${b + 1} of ${batches.length}…`);
        let txHash = batch.txHash || "";
        if (batch.walletTx) {
          const wt = batch.walletTx as EvmWalletTx | BoingWalletTx;
          if (wt.chain === "evm") {
            txHash = await sendEvmWalletTx(wt);
          } else if (wt.chain === "boing") {
            try {
              txHash = await sendBoingMintWalletTx(wt);
            } catch (err) {
              const code = err instanceof Error ? err.message : "";
              throw new Error(mintPublishErrorMessage(code || "mint_failed"));
            }
          } else {
            txHash =
              (await maybeSendWalletTx({
                walletTx: batch.walletTx,
                listingId: batch.listingIds[0] ?? collectionId,
                action: "mint",
              })) || "";
          }
          if (!txHash) {
            throw new Error(
              `Wallet required for mint batch ${b + 1}. Earlier batches already went live — retry to finish.`,
            );
          }
        } else if (!txHash) {
          // Never invent simulated mint hashes for live chains — that would
          // mark drafts as minted without an on-chain receipt.
          throw new Error(
            network === "boing"
              ? mintPublishErrorMessage("boing_tx_id_required")
              : `Wallet mint required for batch ${b + 1}. Connect the ${network} wallet and retry.`,
          );
        }
        const confirm = await fetch(`/api/collections/${collectionId}/mint`, {
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
          throw new Error(
            mintPublishErrorMessage(
              String(confirmData.error || "mint_confirm_failed"),
            ),
          );
        }
      }
      setMsg(
        `Minted and published ${listingIds.length} piece${listingIds.length === 1 ? "" : "s"}. They should appear on Open Lane and New collections.`,
      );
      router.refresh();
    } catch (err) {
      const text = mintPublishErrorMessage(
        err instanceof Error ? err.message : "mint_failed",
      );
      setMsg(text);
      if (isMissingContractError(text) || /deploy|contract/i.test(text)) {
        setFailedPhase("deploy");
      } else {
        setFailedPhase(phase);
      }
    } finally {
      setBusy(false);
      setBusyPhase(null);
      setProgress(null);
    }
  }

  return (
    <section className="collection-publish-panel" data-testid="collection-publish-panel">
      <h3 className="display" style={{ margin: "0 0 0.35rem", fontSize: "1.15rem" }}>
        Finish publishing
      </h3>
      <PublishLifecycleStatus
        snapshot={lifecycle}
        title="Where you are"
        compact
        testId="collection-publish-lifecycle"
      />
      <p className="fm-form-note" style={{ margin: "0.75rem 0" }}>
        {drafts.length} draft{drafts.length === 1 ? "" : "s"} still private
        {mintedDrafts.length
          ? ` · ${mintedDrafts.length} minted and ready to list`
          : ""}
        {unmintedDrafts.length
          ? ` · ${unmintedDrafts.length} still need mint`
          : ""}
        . Soft-launch puts them on Open Lane with a working buy path.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {mintedDrafts.length > 0 ? (
          <button
            type="button"
            className="fm-btn fm-btn--primary"
            disabled={busy}
            onClick={() => void softLaunchMinted()}
          >
            Soft-launch minted drafts
          </button>
        ) : null}
        {unmintedDrafts.length > 0 ? (
          <button
            type="button"
            className="fm-btn fm-btn--ghost"
            disabled={busy}
            onClick={() => void mintAndPublishRemaining()}
          >
            Mint &amp; publish remaining
          </button>
        ) : null}
      </div>
      {progress ? (
        <p className="fm-form-note" style={{ marginTop: "0.65rem" }}>
          {progress}
        </p>
      ) : null}
      {msg ? (
        <p
          className="fm-form-note"
          style={{ marginTop: "0.65rem" }}
          role="status"
          data-testid="collection-publish-message"
        >
          {msg}
        </p>
      ) : null}
    </section>
  );
}
