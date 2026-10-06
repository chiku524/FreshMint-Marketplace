"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function FollowButton({
  artistId,
  initiallyFollowing = false,
  compact = false,
  label = "Follow",
}: {
  artistId: string;
  initiallyFollowing?: boolean;
  compact?: boolean;
  /** Button idle label; following state always shows "Following". */
  label?: string;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initiallyFollowing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [ready, setReady] = useState(Boolean(initiallyFollowing));

  useEffect(() => {
    setFollowing(initiallyFollowing);
  }, [initiallyFollowing, artistId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const meRes = await fetch("/api/auth/me", { credentials: "include" });
        const me = meRes.ok
          ? ((await meRes.json()) as { user?: { id?: string } | null })
          : null;
        const uid = me?.user?.id;
        if (!uid) {
          if (!cancelled) setReady(true);
          return;
        }
        if (uid === artistId) {
          if (!cancelled) setHidden(true);
          return;
        }
        if (initiallyFollowing) {
          if (!cancelled) setReady(true);
          return;
        }
        const statusRes = await fetch(
          `/api/follow?artistId=${encodeURIComponent(artistId)}`,
          { credentials: "include" },
        );
        if (!statusRes.ok) {
          if (!cancelled) setReady(true);
          return;
        }
        const status = (await statusRes.json()) as { following?: boolean };
        if (!cancelled) {
          setFollowing(Boolean(status.following));
          setReady(true);
        }
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artistId, initiallyFollowing]);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistId, unfollow: following }),
      });
      const data = (await res.json()) as { error?: string };
      if (res.status === 401) {
        const next = encodeURIComponent(
          typeof window !== "undefined" ? window.location.pathname : "/",
        );
        window.location.assign(`/sign-in?next=${next}`);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "failed");
      setFollowing(!following);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  if (hidden) return null;

  return (
    <span
      className={`follow-btn${compact ? " follow-btn--compact" : ""}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        className={`badge${following ? " emerging" : ""}`}
        disabled={busy || !ready}
        style={{
          cursor: busy ? "wait" : "pointer",
          background: "transparent",
          padding: compact ? "0.12rem 0.4rem" : undefined,
          fontSize: compact ? "0.65rem" : undefined,
        }}
        onClick={() => void toggle()}
        aria-pressed={following}
        aria-label={following ? "Following" : label}
      >
        {busy ? "…" : following ? "Following" : label}
      </button>
      {error ? (
        <span style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{error}</span>
      ) : null}
    </span>
  );
}
