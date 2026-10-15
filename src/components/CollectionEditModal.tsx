"use client";

import { CollectionProfileEditor } from "@/components/CollectionProfileEditor";
import { useCallback, useEffect, useId, useRef, useState } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function CollectionEditModal({
  collectionId,
  description = "",
  imageUrl = null,
  bannerUrl = null,
  websiteUrl = null,
  twitterUrl = null,
  discordUrl = null,
  instagramUrl = null,
}: {
  collectionId: string;
  description?: string;
  imageUrl?: string | null;
  bannerUrl?: string | null;
  websiteUrl?: string | null;
  twitterUrl?: string | null;
  discordUrl?: string | null;
  instagramUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current =
      (document.activeElement as HTMLElement | null) ?? triggerRef.current;

    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      dialog
        ? ([...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
            (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
          ) as HTMLElement[])
        : [];

    const initial = focusables();
    (initial[0] ?? dialog)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const nodes = focusables();
      if (nodes.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      const restore = previouslyFocused.current ?? triggerRef.current;
      restore?.focus();
    };
  }, [open, close]);

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
        Edit collection
      </button>

      {open ? (
        <div
          className="fm-form-dialog-scrim collection-edit-modal__scrim"
          onClick={close}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="fm-form-dialog collection-edit-modal__dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="collection-edit-modal__head">
              <h2 id={titleId} className="display collection-edit-modal__title">
                Edit collection
              </h2>
              <button
                type="button"
                className="fm-btn fm-btn--ghost collection-edit-modal__close"
                aria-label="Close"
                onClick={close}
              >
                Close
              </button>
            </div>
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
          </div>
        </div>
      ) : null}
    </>
  );
}
