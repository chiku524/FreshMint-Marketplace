"use client";

import { toast } from "@/lib/client/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Persistent Save on WorkCard caption — posts to /api/signals.
 * After first save with zero shelves, offers a light Make a shelf first-run.
 */
export function SaveButton({
  listingId,
  className,
  compact = false,
}: {
  listingId: string;
  className?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shelfHint, setShelfHint] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSave(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (busy || saved) return;
    // Optimistic: show Saved immediately, roll back on failure.
    setSaved(true);
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/signals", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, type: "save" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaved(false);
        if (res.status === 401) {
          toast("Sign in to save works", "info", { href: "/sign-in", label: "Sign in" });
        } else {
          toast(data.error === "rate_limited" ? "Slow down a little \u2014 try again in a moment" : "Couldn't save. Please try again.", "error");
        }
        return;
      }
      toast("Saved", "ok", { href: "/studio#shelves", label: "Add to a shelf" });

      // First-run: signed-in saver with zero owned shelves → Make a shelf.
      try {
        const [meRes, shelvesRes] = await Promise.all([
          fetch("/api/auth/me", { credentials: "include" }),
          fetch("/api/shelves", { credentials: "include" }),
        ]);
        const me = meRes.ok ? await meRes.json() : null;
        const uid =
          me?.user && typeof me.user.id === "string" ? me.user.id : null;
        if (uid && shelvesRes.ok) {
          const shelvesData = await shelvesRes.json();
          const shelves = Array.isArray(shelvesData.shelves)
            ? shelvesData.shelves
            : [];
          const owned = shelves.filter(
            (s: { curatorId?: string }) => s.curatorId === uid,
          );
          if (owned.length === 0) setShelfHint(true);
        }
      } catch {
        // Save already succeeded; shelf hint is optional.
      }
      router.refresh();
    } catch {
      setSaved(false);
      toast("Couldn't save. Check your connection.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span
      className={`work-tile__save${className ? ` ${className}` : ""}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        className={`badge${saved ? " emerging" : ""}`}
        aria-busy={busy}
        aria-pressed={saved}
        style={{
          cursor: "pointer",
          background: "transparent",
          padding: compact ? "0.12rem 0.4rem" : undefined,
          fontSize: compact ? "0.65rem" : undefined,
        }}
        onClick={(e) => void onSave(e)}
        aria-label={saved ? "Saved" : "Save work"}
      >
        {saved ? "Saved" : "Save"}
      </button>
      {msg && msg !== "failed" ? (
        <span style={{ fontSize: "0.68rem", color: "var(--ink-muted)" }}>
          {msg}
        </span>
      ) : null}
      {shelfHint ? (
        <span className="work-tile__shelf-hint">
          <Link href="/studio#shelves">Make a shelf</Link>
          {" · "}
          <Link href="/shelves">Browse shelves</Link>
        </span>
      ) : null}
    </span>
  );
}
