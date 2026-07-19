"use client";

import { useEffect, useRef } from "react";

/** Fires a one-shot impression when the card enters the viewport. */
export function ImpressionTracker({
  listingId,
  bucket,
}: {
  listingId: string;
  bucket?: string;
}) {
  const sent = useRef(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || sent.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || sent.current) return;
        sent.current = true;
        void fetch("/api/signals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingId,
            type: "impression",
            bucket,
          }),
        });
        observer.disconnect();
      },
      { threshold: 0.45 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [listingId, bucket]);

  return <span ref={ref} aria-hidden style={{ position: "absolute", inset: 0 }} />;
}
