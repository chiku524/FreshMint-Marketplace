"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ListingOpt = { id: string; title: string; stage: string };

export function StudioPanel() {
  const router = useRouter();
  const [listings, setListings] = useState<ListingOpt[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [shelfName, setShelfName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    void fetch("/api/listings")
      .then((r) => r.json())
      .then((d) => {
        setListings(
          (d.items ?? []).map((l: ListingOpt) => ({
            id: l.id,
            title: l.title,
            stage: l.stage,
          })),
        );
      });
  }, []);

  async function feature(listingId: string, action: "feature" | "unfeature") {
    setMsg(null);
    const res = await fetch("/api/editorial/feature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId, action }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setMsg(data.error ?? "failed");
      return;
    }
    setMsg(action === "feature" ? "Featured" : "Removed from Featured");
    router.refresh();
  }

  async function createShelf(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch("/api/shelves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: shelfName, listingIds: selected }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setMsg(data.error ?? "failed");
      return;
    }
    setMsg(`Shelf “${data.shelf.name}” created`);
    setShelfName("");
    setSelected([]);
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: "2rem" }}>
      <section>
        <h2 className="display" style={{ fontSize: "1.4rem" }}>
          Editorial Featured
        </h2>
        <p style={{ color: "var(--ink-muted)" }}>
          Editors/moderators promote Rising works into the fixed Featured inventory.
        </p>
        <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.75rem" }}>
          {listings
            .filter((l) => l.stage !== "draft")
            .slice(0, 20)
            .map((l) => (
              <div
                key={l.id}
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                  flexWrap: "wrap",
                  borderBottom: "1px solid var(--line)",
                  padding: "0.45rem 0",
                }}
              >
                <span style={{ flex: 1 }}>
                  {l.title}{" "}
                  <span style={{ color: "var(--ink-muted)" }}>({l.stage})</span>
                </span>
                <button
                  type="button"
                  className="badge featured"
                  style={{ cursor: "pointer", background: "transparent" }}
                  onClick={() => void feature(l.id, "feature")}
                >
                  Feature
                </button>
                <button
                  type="button"
                  className="badge"
                  style={{ cursor: "pointer", background: "transparent" }}
                  onClick={() => void feature(l.id, "unfeature")}
                >
                  Unfeature
                </button>
              </div>
            ))}
        </div>
      </section>

      <section>
        <h2 className="display" style={{ fontSize: "1.4rem" }}>
          Create collector shelf
        </h2>
        <form onSubmit={createShelf} style={{ display: "grid", gap: "0.75rem", maxWidth: "32rem" }}>
          <input
            value={shelfName}
            onChange={(e) => setShelfName(e.target.value)}
            placeholder="Shelf name"
            required
            style={{
              background: "rgba(12,31,26,0.65)",
              border: "1px solid var(--line)",
              color: "var(--ink)",
              padding: "0.55rem 0.7rem",
            }}
          />
          <div style={{ display: "grid", gap: "0.35rem", maxHeight: "12rem", overflow: "auto" }}>
            {listings.slice(0, 30).map((l) => (
              <label key={l.id} style={{ display: "flex", gap: "0.5rem", fontSize: "0.92rem" }}>
                <input
                  type="checkbox"
                  checked={selected.includes(l.id)}
                  onChange={(e) => {
                    setSelected((prev) =>
                      e.target.checked
                        ? [...prev, l.id]
                        : prev.filter((id) => id !== l.id),
                    );
                  }}
                />
                {l.title}
              </label>
            ))}
          </div>
          <button
            type="submit"
            className="badge emerging"
            style={{
              cursor: "pointer",
              background: "transparent",
              justifySelf: "start",
              padding: "0.5rem 0.8rem",
            }}
          >
            Publish shelf
          </button>
        </form>
      </section>

      {msg ? <p style={{ color: "var(--emergent)" }}>{msg}</p> : null}
    </div>
  );
}
