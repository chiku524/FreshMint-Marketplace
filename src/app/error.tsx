"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function RouteError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page-wrap" role="alert">
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.2rem" }}>
        Something went wrong
      </h1>
      <p style={{ color: "var(--ink-muted)", margin: "0 0 1.5rem", maxWidth: "48ch" }}>
        This page failed to load. It is usually temporary — try again, or head
        back to discovery.
        {error.digest ? ` (ref ${error.digest})` : null}
      </p>
      <p style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="badge" style={{ cursor: "pointer" }} onClick={() => unstable_retry()}>
          Try again
        </button>
        <Link href="/">Back to discovery</Link>
      </p>
    </div>
  );
}