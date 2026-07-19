"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function FollowButton({
  artistId,
  initiallyFollowing = false,
}: {
  artistId: string;
  initiallyFollowing?: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initiallyFollowing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistId, unfollow: following }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setFollowing(!following);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
      <button
        type="button"
        className="badge featured"
        disabled={busy}
        style={{ cursor: "pointer", background: "transparent" }}
        onClick={() => void toggle()}
      >
        {busy ? "…" : following ? "Following" : "Follow artist"}
      </button>
      {error ? (
        <span style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{error}</span>
      ) : null}
    </span>
  );
}
