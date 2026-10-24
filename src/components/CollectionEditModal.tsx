"use client";

import { CollectionPackagePanel } from "@/components/CollectionPackagePanel";
import { CollectionProfileEditor } from "@/components/CollectionProfileEditor";
import { FmDialog } from "@/components/FmDialog";
import { useRef, useState } from "react";

function EditIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        d="M11.5 2.5a1.5 1.5 0 0 1 2.12 2.12L5.5 12.74 2 13.5l.76-3.5L11.5 2.5Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Creator-only collection settings behind a compact edit control.
 * Keeps the public collection page free of the profile form and package admin.
 */
export function CollectionEditModal({
  collectionId,
  collectionSlug,
  description = "",
  imageUrl = null,
  bannerUrl = null,
  websiteUrl = null,
  twitterUrl = null,
  discordUrl = null,
  instagramUrl = null,
}: {
  collectionId: string;
  collectionSlug?: string | null;
  description?: string;
  imageUrl?: string | null;
  bannerUrl?: string | null;
  websiteUrl?: string | null;
  twitterUrl?: string | null;
  discordUrl?: string | null;
  instagramUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="fm-btn fm-btn--ghost collection-edit-modal__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Edit collection settings"
        onClick={() => setOpen(true)}
      >
        <EditIcon />
        <span>Settings</span>
      </button>

      <FmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Collection settings"
        dialogClassName="collection-edit-modal__dialog"
        scrimClassName="collection-edit-modal__scrim"
      >
        <CollectionProfileEditor
          collectionId={collectionId}
          description={description}
          imageUrl={imageUrl}
          bannerUrl={bannerUrl}
          websiteUrl={websiteUrl}
          twitterUrl={twitterUrl}
          discordUrl={discordUrl}
          instagramUrl={instagramUrl}
          embedded
        />
        <div className="collection-edit-modal__package">
          <h3 className="collection-edit-modal__section-title">
            Remaining works package
          </h3>
          <CollectionPackagePanel
            collectionId={collectionId}
            collectionSlug={collectionSlug}
            isOwner
            embedded
          />
        </div>
      </FmDialog>
    </>
  );
}
