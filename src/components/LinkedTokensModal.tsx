"use client";

import { FmDialog } from "@/components/FmDialog";
import type { LinkedTokenRef } from "@/lib/marketplace/linked-tokens";
import {
  sendBoingWalletTx,
  type BoingWalletTx,
} from "@/lib/onchain/wallet-client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type DraftRow = {
  key: string;
  address: string;
  label: string;
};

function toDraft(tokens: LinkedTokenRef[]): DraftRow[] {
  return tokens.map((t, i) => ({
    key: `${t.address}-${i}`,
    address: t.address,
    label: t.label ?? "",
  }));
}

/**
 * Creator-only modal to link fungible tokens via the **on-chain registry**
 * (Boing). DB cache refreshes after wallet txs confirm.
 */
export function LinkedTokensModal({
  collectionId,
  initialTokens = [],
  chain,
  contractAddress,
}: {
  collectionId: string;
  initialTokens?: LinkedTokenRef[];
  chain: string;
  contractAddress?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DraftRow[]>(() => toDraft(initialTokens));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const isBoing = chain === "boing";
  const deployed = Boolean(contractAddress?.trim());

  const countLabel = useMemo(() => {
    const n = initialTokens.length;
    if (n === 0) return "Link tokens";
    return n === 1 ? "1 linked token" : `${n} linked tokens`;
  }, [initialTokens.length]);

  function openModal() {
    setRows(toDraft(initialTokens));
    setError(null);
    setOk(null);
    setOpen(true);
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { key: `new-${Date.now()}-${prev.length}`, address: "", label: "" },
    ]);
  }

  function updateRow(key: string, patch: Partial<DraftRow>) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  async function saveOnchain() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      if (!isBoing) {
        throw new Error(
          "Official linked tokens use the Boing on-chain registry. Switch this collection to Boing or wait for cross-chain registry support.",
        );
      }
      if (!deployed) {
        throw new Error("Deploy the collection on-chain before linking tokens.");
      }

      const tokens = rows
        .map((r) => ({
          address: r.address.trim(),
          label: r.label.trim() || null,
        }))
        .filter((r) => r.address.length > 0);

      const planRes = await fetch(
        `/api/collections/${collectionId}/linked-tokens`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokens }),
        },
      );
      const plan = (await planRes.json()) as {
        error?: string;
        errors?: string[];
        walletTxs?: BoingWalletTx[];
        note?: string;
      };
      if (!planRes.ok) {
        const code = plan.error || plan.errors?.[0];
        if (code === "registry_address_unset") {
          throw new Error(
            "Set NEXT_PUBLIC_BOING_LINKED_NFT_TOKEN_REGISTRY to the deployed registry AccountId.",
          );
        }
        if (code === "registry_boing_only") {
          throw new Error(
            "Official linked tokens require Boing AccountIds on both sides.",
          );
        }
        throw new Error(
          (Array.isArray(plan.errors) && plan.errors.join(", ")) ||
            plan.error ||
            "registry_plan_failed",
        );
      }

      const txs = plan.walletTxs ?? [];
      for (const wt of txs) {
        await sendBoingWalletTx(wt);
      }

      const confirmRes = await fetch(
        `/api/collections/${collectionId}/linked-tokens`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokens }),
        },
      );
      const confirm = (await confirmRes.json()) as {
        error?: string;
        errors?: string[];
      };
      if (!confirmRes.ok) {
        throw new Error(
          (Array.isArray(confirm.errors) && confirm.errors.join(", ")) ||
            confirm.error ||
            "registry_confirm_failed",
        );
      }

      setOk("Registry updated — cache refreshed");
      router.refresh();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "update_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="fm-btn fm-btn--ghost"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openModal}
      >
        {countLabel}
      </button>

      <FmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Linked tokens"
        dialogClassName="linked-tokens-modal__dialog"
      >
        <p className="linked-tokens-modal__lead">
          Companion fungible tokens are registered <strong>on-chain</strong> via
          the Boing linked NFT↔token registry (selectors 0xE0–0xE6; env{" "}
          <code>NEXT_PUBLIC_BOING_LINKED_NFT_TOKEN_REGISTRY</code>). Your wallet
          must be the <strong>asset claimer</strong> of both the collection and
          each token (claim runs in the same flow). FreshMint caches peers for
          display after confirm — the registry is the source of truth. Mutable ·
          many-to-many · claimer-gated.
        </p>

        {!isBoing ? (
          <p className="linked-tokens-modal__error">
            Official linking requires a Boing collection and the on-chain
            registry. This collection is on {chain}.
          </p>
        ) : null}
        {isBoing && !deployed ? (
          <p className="linked-tokens-modal__error">
            Deploy the collection contract before registering linked tokens.
          </p>
        ) : null}

        <ul className="linked-tokens-modal__list">
          {rows.length === 0 ? (
            <li className="linked-tokens-modal__empty">No tokens linked yet.</li>
          ) : (
            rows.map((row) => (
              <li key={row.key} className="linked-tokens-modal__row">
                <label className="linked-tokens-modal__field">
                  <span>Token address</span>
                  <input
                    className="fm-field"
                    value={row.address}
                    onChange={(e) =>
                      updateRow(row.key, { address: e.target.value })
                    }
                    placeholder="0x… Boing fungible AccountId"
                    spellCheck={false}
                    disabled={busy || !isBoing}
                  />
                </label>
                <label className="linked-tokens-modal__field linked-tokens-modal__field--label">
                  <span>Label (optional, display cache)</span>
                  <input
                    className="fm-field"
                    value={row.label}
                    onChange={(e) =>
                      updateRow(row.key, { label: e.target.value })
                    }
                    placeholder="Symbol or name"
                    maxLength={64}
                    disabled={busy || !isBoing}
                  />
                </label>
                <button
                  type="button"
                  className="fm-btn fm-btn--ghost linked-tokens-modal__remove"
                  onClick={() => removeRow(row.key)}
                  disabled={busy || !isBoing}
                >
                  Remove
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="linked-tokens-modal__actions">
          <button
            type="button"
            className="fm-btn fm-btn--ghost"
            onClick={addRow}
            disabled={busy || !isBoing}
          >
            Add token
          </button>
          <button
            type="button"
            className="fm-btn fm-btn--primary"
            onClick={() => void saveOnchain()}
            disabled={busy || !isBoing || !deployed}
          >
            {busy ? "Submitting…" : "Register on-chain"}
          </button>
        </div>

        {error ? <p className="linked-tokens-modal__error">{error}</p> : null}
        {ok ? <p className="linked-tokens-modal__ok">{ok}</p> : null}
      </FmDialog>
    </>
  );
}
