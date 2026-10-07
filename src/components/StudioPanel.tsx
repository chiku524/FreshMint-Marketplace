"use client";

import { StudioCollectionsHub } from "@/components/StudioCollectionsHub";
import type { StudioCollectionRow } from "@/lib/marketplace/studio-hub";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ListingOpt = { id: string; title: string; stage: string };

export function StudioPanel({
  collections,
  canEditFeatured = false,
  signedIn = false,
}: {
  collections: StudioCollectionRow[];
  canEditFeatured?: boolean;
  signedIn?: boolean;
}) {
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
    if (!signedIn) {
      setMsg("sign_in");
      return;
    }
    const res = await fetch("/api/shelves", {
      method: "POST",
      credentials: "include",
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
    <div className="studio-panel">
      <StudioCollectionsHub rows={collections} signedIn={signedIn} />

      {canEditFeatured ? (
        <section className="studio-panel__section">
          <h2 className="display studio-panel__section-title">
            Editorial Featured
          </h2>
          <p className="studio-panel__section-lead">
            Editors and moderators promote Rising works into the fixed Featured
            inventory. Paid boosts are separate and labeled Promoted.
          </p>
          <div className="studio-panel__feature-list">
            {listings
              .filter((l) => l.stage !== "draft")
              .slice(0, 20)
              .map((l) => (
                <div key={l.id} className="studio-panel__feature-row">
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
      ) : null}

      <section id="shelves" className="studio-panel__section">
        <h2 className="display studio-panel__section-title">
          Collector shelves
        </h2>
        <p className="studio-panel__section-lead">
          Name a shelf and add works you care about — others can follow it from{" "}
          <Link href="/shelves">Shelves</Link>. Saving from a card can start you
          here when you have none yet.
        </p>
        {!signedIn ? (
          <p style={{ color: "var(--ink-muted)" }}>
            <Link href="/sign-in?next=/studio#shelves">Sign in</Link> to publish a
            shelf.
          </p>
        ) : (
          <form
            onSubmit={createShelf}
            className="fm-form-stack fm-form-stack--wide"
          >
            <label>
              Shelf name
              <input
                value={shelfName}
                onChange={(e) => setShelfName(e.target.value)}
                placeholder="Shelf name"
                required
                className="fm-field"
              />
            </label>
            <div
              style={{
                display: "grid",
                gap: "0.35rem",
                maxHeight: "12rem",
                overflow: "auto",
              }}
            >
              {listings.slice(0, 30).map((l) => (
                <label
                  key={l.id}
                  style={{ display: "flex", gap: "0.5rem", fontSize: "0.92rem" }}
                >
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
            <div className="fm-form-actions">
              <button type="submit" className="fm-btn fm-btn--primary">
                Publish shelf
              </button>
            </div>
          </form>
        )}
      </section>

      {msg === "sign_in" ? (
        <p style={{ color: "var(--ink-muted)" }}>
          <Link href="/sign-in?next=/studio">Sign in</Link> to curate.
        </p>
      ) : msg ? (
        <p style={{ color: "var(--emergent)" }}>{msg}</p>
      ) : null}
    </div>
  );
}
