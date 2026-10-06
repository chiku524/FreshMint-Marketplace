"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FeaturedBoostButton } from "@/components/FeaturedBoostButton";
import { SaleModeEditor } from "@/components/SaleModeEditor";
import type { SaleMode } from "@/lib/marketplace/sale-mode";

/**
 * Owner/seller rail on the NFT page: edit price, cancel/relist, advanced sale mode.
 */
export function ManageListingPanel({
  listingId,
  saleMode,
  startingBidUsd,
  reserveUsd,
  priceUsd,
  delisted,
  stage,
  alreadyBoosted,
  defaultNetwork,
  showBoost,
  hasBids,
  embedded = false,
}: {
  listingId: string;
  saleMode: SaleMode | string;
  startingBidUsd?: number | null;
  reserveUsd?: number | null;
  priceUsd?: number | null;
  delisted: boolean;
  stage: string;
  alreadyBoosted?: boolean;
  defaultNetwork?: string;
  showBoost?: boolean;
  hasBids?: boolean;
  /** When true, omit page heading (dialog provides the title). */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [price, setPrice] = useState(
    priceUsd != null && priceUsd > 0 ? String(priceUsd) : "",
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function savePrice() {
    const priceUsdNum = Number(price);
    if (!Number.isFinite(priceUsdNum) || priceUsdNum <= 0) {
      setMsg("Enter a positive USD price");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/listings/${listingId}/sale-mode`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleMode:
            saleMode === "timed_window" ||
            saleMode === "english" ||
            saleMode === "dutch"
              ? saleMode
              : "fixed",
          priceUsd: priceUsdNum,
          startingBidUsd:
            saleMode === "english" || saleMode === "dutch"
              ? startingBidUsd ?? priceUsdNum
              : null,
          reserveUsd: reserveUsd ?? null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "save_failed");
      setMsg("Price updated");
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "save_failed");
    } finally {
      setBusy(false);
    }
  }

  async function cancelListing() {
    if (!window.confirm("Cancel this listing? It will leave discovery until you relist.")) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/listings/${listingId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "cancel_failed");
      setMsg("Listing cancelled");
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "cancel_failed");
    } finally {
      setBusy(false);
    }
  }

  async function relist() {
    const priceUsdNum = Number(price);
    if (!Number.isFinite(priceUsdNum) || priceUsdNum <= 0) {
      setMsg("Enter a positive USD price to relist");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/listings/${listingId}/relist`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceUsd: priceUsdNum }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "relist_failed");
      setMsg("Listed for sale again");
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "relist_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={
        embedded
          ? "listing-manage-panel listing-manage-panel--embedded"
          : "listing-detail__owner-rail fm-listing-form"
      }
    >
      {embedded ? null : (
        <h2 className="display" style={{ margin: "0 0 0.4rem", fontSize: "1.15rem" }}>
          Manage listing
        </h2>
      )}
      <p className="fm-form-note" style={{ margin: "0 0 0.65rem" }}>
        {delisted
          ? "Not listed for sale. Relist to appear in discovery again."
          : "Edit price, cancel the listing, or change advanced sale options."}
      </p>

      <div className="fm-form-stack" style={{ maxWidth: "16rem" }}>
        <label>
          List price (USD)
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            className="fm-field"
            disabled={Boolean(hasBids)}
          />
        </label>
      </div>

      <div className="fm-form-actions" style={{ marginTop: "0.55rem" }}>
        {delisted ? (
          <button
            type="button"
            className="fm-btn fm-btn--primary"
            disabled={busy}
            onClick={() => void relist()}
          >
            {busy ? "Working…" : "List for sale"}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="fm-btn fm-btn--primary"
              disabled={busy || Boolean(hasBids)}
              onClick={() => void savePrice()}
            >
              {busy ? "Saving…" : "Save price"}
            </button>
            <button
              type="button"
              className="fm-btn fm-btn--ghost"
              disabled={busy || Boolean(hasBids)}
              onClick={() => void cancelListing()}
            >
              Cancel listing
            </button>
          </>
        )}
      </div>
      {hasBids ? (
        <p className="fm-form-note" style={{ marginTop: "0.4rem" }}>
          Price and cancel are locked while bids are open.
        </p>
      ) : null}
      {msg ? (
        <p className="fm-form-note" style={{ marginTop: "0.4rem" }}>
          {msg}
        </p>
      ) : null}

      {!delisted ? (
        <SaleModeEditor
          listingId={listingId}
          saleMode={saleMode}
          startingBidUsd={startingBidUsd}
          reserveUsd={reserveUsd}
          priceUsd={priceUsd}
        />
      ) : null}

      {showBoost && stage !== "draft" && !delisted ? (
        <FeaturedBoostButton
          listingId={listingId}
          alreadyBoosted={Boolean(alreadyBoosted)}
          defaultNetwork={defaultNetwork}
        />
      ) : null}
    </section>
  );
}
