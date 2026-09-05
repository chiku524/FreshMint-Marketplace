"use client";

import { useEffect, useRef } from "react";

/** Records one listing-page open for the discovery ranker. */
export function PageViewTracker({ listingId }: { listingId: string }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void fetch("/api/signals", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId, type: "page_view" }),
    });
  }, [listingId]);

  return null;
}
