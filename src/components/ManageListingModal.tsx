"use client";

import { FmDialog } from "@/components/FmDialog";
import { ManageListingPanel } from "@/components/ManageListingPanel";
import type { SaleMode } from "@/lib/marketplace/sale-mode";
import { useRef, useState } from "react";

/**
 * Owner manage-listing controls behind a single trigger — keeps the listing
 * detail page free of the always-visible price / cancel / sale-mode / boost rail.
 */
export function ManageListingModal({
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
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="fm-btn fm-btn--ghost"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Manage listing
      </button>

      <FmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Manage listing"
      >
        <ManageListingPanel
          listingId={listingId}
          saleMode={saleMode}
          startingBidUsd={startingBidUsd}
          reserveUsd={reserveUsd}
          priceUsd={priceUsd}
          delisted={delisted}
          stage={stage}
          alreadyBoosted={alreadyBoosted}
          defaultNetwork={defaultNetwork}
          showBoost={showBoost}
          hasBids={hasBids}
          embedded
        />
      </FmDialog>
    </>
  );
}
