"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal shell matching FreshMint dialog patterns
 * (CollectionEditModal / ListingPreviewModal).
 */
export function FmDialog({
  open,
  onClose,
  title,
  children,
  dialogClassName,
  scrimClassName,
  initialFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  dialogClassName?: string;
  scrimClassName?: string;
  /** Prefer focusing this control when the dialog opens. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      dialog
        ? [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
            (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
          )
        : [];

    const preferred = initialFocusRef?.current;
    if (preferred && dialog?.contains(preferred)) {
      preferred.focus();
    } else {
      const initial = focusables();
      (initial[0] ?? dialog)?.focus();
    }

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
      previouslyFocused.current?.focus();
    };
  }, [open, close, initialFocusRef]);

  if (!open) return null;

  return (
    <div
      className={`fm-form-dialog-scrim listing-action-modal__scrim${scrimClassName ? ` ${scrimClassName}` : ""}`}
      onClick={close}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`fm-form-dialog listing-action-modal__dialog${dialogClassName ? ` ${dialogClassName}` : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="listing-action-modal__head">
          <h2 id={titleId} className="display listing-action-modal__title">
            {title}
          </h2>
          <button
            type="button"
            className="fm-btn fm-btn--ghost listing-action-modal__close"
            aria-label="Close"
            onClick={close}
          >
            Close
          </button>
        </div>
        <div className="listing-action-modal__body">{children}</div>
      </div>
    </div>
  );
}
