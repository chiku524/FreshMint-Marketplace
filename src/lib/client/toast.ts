/**
 * Tiny app-wide toast bus. Components call `toast(...)`; <ToastHost /> in the
 * root layout renders them in one polite live region, so feedback looks and
 * sounds the same everywhere.
 */
import { friendlyError, looksLikeErrorCode } from "@/lib/client/friendly-error";

export type ToastKind = "ok" | "error" | "info";
export type ToastDetail = { id: number; text: string; kind: ToastKind; href?: string; hrefLabel?: string };

export const TOAST_EVENT = "fm-toast";
let seq = 0;

export function toast(
  text: string,
  kind: ToastKind = "info",
  link?: { href: string; label: string },
): void {
  if (typeof window === "undefined") return;
  seq += 1;
  // Last line of defence: a raw API code is never shown as a toast.
  if (looksLikeErrorCode(text)) text = friendlyError(text);
  const detail: ToastDetail = { id: seq, text, kind, href: link?.href, hrefLabel: link?.label };
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail }));
}