"use client";

import { formatBoingMintUserMessage } from "@/lib/onchain/boing-messages";
import {
  maybeSendWalletTx,
  requestBuyerAddress,
  sendBoingMintWalletTx,
  sendEvmWalletTx,
  type BoingWalletTx,
  type EvmWalletTx,
} from "@/lib/onchain/wallet-client";
import { useRouter } from "next/navigation";
import { useState } from "react";

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

export function CollectionPublishPanel({
  collectionId,
  network,
  drafts,
}: {
  collectionId: string;
  network: string;
  drafts: DraftPiece[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const mintedDrafts = drafts.filter((d) => d.minted);
  const unmintedDrafts = drafts.filter((d) => !d.minted);

  if (drafts.length === 0) return null;

  async function softLaunchMinted() {
    setBusy(true);
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
      setMsg(err instanceof Error ? err.message : "publish_failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function mintAndPublishRemaining() {
    setBusy(true);
    setMsg(null);
    try {
      const listingIds = unmintedDrafts.map((d) => d.id);
      if (!listingIds.length) {
        setMsg("Nothing left to mint — try Soft-launch minted drafts.");
        return;
      }
      const chainVm =
        network === "solana" ? "solana" : network === "boing" ? "boing" : "evm";
      const creatorAddress = await requestBuyerAddress(chainVm);

      // Heal Boing deploy rows that never stored the real contract AccountId.
      if (network === "boing") {
        setProgress("Checking collection deploy…");
        try {
          await fetch(`/api/collections/${collectionId}/deploy`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "sync",
              creatorAddress: creatorAddress || undefined,
            }),
          });
        } catch {
          // Prepare still validates; sync is best-effort.
        }
      }

      setProgress("Preparing mint batches…");
      const prep = await fetch(`/api/collections/${collectionId}/mint`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          listingIds,
          creatorAddress: creatorAddress || undefined,
        }),
      });
      const prepData = await prep.json();
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
      setMsg(
        mintPublishErrorMessage(
          err instanceof Error ? err.message : "mint_failed",
        ),
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <section className="collection-publish-panel" data-testid="collection-publish-panel">
      <h3 className="display" style={{ margin: "0 0 0.35rem", fontSize: "1.15rem" }}>
        Finish publishing
      </h3>
      <p className="fm-form-note" style={{ margin: "0 0 0.75rem" }}>
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
        <p className="fm-form-note" style={{ marginTop: "0.65rem" }} role="status">
          {msg}
        </p>
      ) : null}
    </section>
  );
}
