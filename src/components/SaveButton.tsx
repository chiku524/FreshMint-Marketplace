"use client";

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
    if (busy) return;
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
        setMsg(data.error || "failed");
        return;
      }
      setSaved(true);

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
      setMsg("failed");
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
        disabled={busy}
        style={{
          cursor: busy ? "wait" : "pointer",
          background: "transparent",
          padding: compact ? "0.12rem 0.4rem" : undefined,
          fontSize: compact ? "0.65rem" : undefined,
        }}
        onClick={(e) => void onSave(e)}
        aria-label={saved ? "Saved" : "Save work"}
      >
        {busy ? "…" : saved ? "Saved" : "Save"}
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
