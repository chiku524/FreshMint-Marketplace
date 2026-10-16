"use client";

import { useEffect, useState } from "react";

/** Shown while the server is serving fallback data because Postgres is down. */
export function MaintenanceBanner() {
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        const body = (await res.json()) as { degraded?: boolean };
        if (cancelled) return;
        setDegraded(Boolean(body.degraded));
        // Keep polling slowly only while degraded so recovery clears the banner.
        if (body.degraded) timer = setTimeout(check, 60_000);
      } catch {
        // Network hiccup: stay quiet rather than alarm users.
      }
    };
    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!degraded) return null;
  return (
    <div
      role="status"
      className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900"
    >
      We&apos;re having trouble reaching our database. You may be seeing sample
      data, and changes made right now might not be saved. We&apos;re retrying
      automatically.
    </div>
  );
}