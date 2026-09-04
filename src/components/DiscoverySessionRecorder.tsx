"use client";

import { useEffect, useRef } from "react";

/** Persists shown artists/listings so diversity holds across scrolls. */
export function DiscoverySessionRecorder({
  listingIds,
  artistIds,
  collectionIds,
}: {
  listingIds: string[];
  artistIds: string[];
  collectionIds: string[];
}) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current || listingIds.length === 0) return;
    sent.current = true;
    void fetch("/api/discovery/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingIds, artistIds, collectionIds }),
    });
  }, [listingIds, artistIds, collectionIds]);

  return null;
}
