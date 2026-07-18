"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ListingActions({
  listingId,
  priceUsd,
  stage,
}: {
  listingId: string;
  priceUsd: number | null;
  stage: string;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  async function post(url: string, body: Record<string, unknown>) {
    setMsg(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || data.errors?.join(", ") || "failed");
      return;
    }
    setMsg("Done");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.6rem" }}>
      <button
        type="button"
        className="badge"
        style={{ cursor: "pointer", background: "transparent" }}
        onClick={() =>
          void post("/api/signals", {
            listingId,
            type: "meaningful_view",
            dwellMs: 4000,
          })
        }
      >
        Record view
      </button>
      <button
        type="button"
        className="badge"
        style={{ cursor: "pointer", background: "transparent" }}
        onClick={() => void post("/api/signals", { listingId, type: "save" })}
      >
        Save
      </button>
      <button
        type="button"
        className="badge"
        style={{ cursor: "pointer", background: "transparent" }}
        onClick={() => void post("/api/nominate", { listingId })}
      >
        Nominate
      </button>
      {priceUsd != null ? (
        <button
          type="button"
          className="badge featured"
          style={{ cursor: "pointer", background: "transparent" }}
          onClick={() =>
            void post("/api/purchase", { listingId, amountUsd: priceUsd })
          }
        >
          Buy ${priceUsd}
        </button>
      ) : null}
      {stage === "soft_launch" ? (
        <button
          type="button"
          className="badge emerging"
          style={{ cursor: "pointer", background: "transparent" }}
          onClick={() =>
            void post(`/api/listings/${listingId}/stage`, {
              target: "rising_eligible",
            })
          }
        >
          Push to Rising
        </button>
      ) : null}
      {msg ? (
        <span style={{ color: "var(--ink-muted)", fontSize: "0.8rem" }}>{msg}</span>
      ) : null}
    </div>
  );
}
