"use client";

import { FmDialog } from "@/components/FmDialog";
import { OfferPanel } from "@/components/OfferPanel";
import { useRef, useState } from "react";

/**
 * Offers form + open-offer list behind a single trigger on the listing page.
 */
export function OfferModal({
  listingId,
  listPriceUsd,
  isSeller,
  sessionUserId,
}: {
  listingId: string;
  listPriceUsd?: number | null;
  isSeller: boolean;
  sessionUserId?: string | null;
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
        {isSeller ? "Offers" : "Make offer"}
      </button>

      <FmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={isSeller ? "Offers" : "Make an offer"}
      >
        <OfferPanel
          listingId={listingId}
          listPriceUsd={listPriceUsd}
          isSeller={isSeller}
          sessionUserId={sessionUserId}
          embedded
        />
      </FmDialog>
    </>
  );
}
