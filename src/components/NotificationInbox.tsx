"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type NotifItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: number | null;
  createdAt: number;
};

export function NotificationInbox() {
  const [items, setItems] = useState<NotifItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function load(cursor?: string | null, append = false) {
    setBusy(true);
    const q = new URLSearchParams({ limit: "30" });
    if (cursor) q.set("cursor", cursor);
    void fetch(`/api/notifications?${q}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items?: NotifItem[]; nextCursor?: string | null } | null) => {
        const page = d?.items ?? [];
        setItems((prev) => (append ? [...prev, ...page] : page));
        setNextCursor(d?.nextCursor ?? null);
      })
      .catch(() => setMsg("Failed to load notifications"))
      .finally(() => setBusy(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function markAll() {
    await fetch("/api/notifications/read-all", {
      method: "POST",
      credentials: "include",
    });
    setItems((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? Date.now() })),
    );
    setMsg("Marked all as read");
  }

  async function markOne(id: string) {
    await fetch(`/api/notifications/${id}/read`, {
      method: "POST",
      credentials: "include",
    });
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: Date.now() } : n)),
    );
  }

  return (
    <section>
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
        <button
          type="button"
          className="badge featured"
          style={{ cursor: "pointer", background: "transparent" }}
          onClick={() => void markAll()}
        >
          Mark all read
        </button>
        <button
          type="button"
          className="badge"
          style={{ cursor: "pointer", background: "transparent" }}
          disabled={busy}
          onClick={() => load()}
        >
          Refresh
        </button>
      </div>
      {msg ? (
        <p style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}>{msg}</p>
      ) : null}
      {items.length === 0 && !busy ? (
        <p style={{ color: "var(--ink-muted)" }}>No notifications yet.</p>
      ) : (
        <ul className="notif-inbox">
          {items.map((n) => (
            <li key={n.id} className={n.readAt ? "" : "is-unread"}>
              <div className="notif-inbox__row">
                {n.href ? (
                  <Link
                    href={n.href}
                    className="notif-inbox__main"
                    onClick={() => {
                      if (!n.readAt) void markOne(n.id);
                    }}
                  >
                    <strong>{n.title}</strong>
                    {n.body ? <span>{n.body}</span> : null}
                    <em>{new Date(n.createdAt).toLocaleString()}</em>
                  </Link>
                ) : (
                  <div className="notif-inbox__main">
                    <strong>{n.title}</strong>
                    {n.body ? <span>{n.body}</span> : null}
                    <em>{new Date(n.createdAt).toLocaleString()}</em>
                  </div>
                )}
                {!n.readAt ? (
                  <button
                    type="button"
                    className="badge"
                    style={{ cursor: "pointer", background: "transparent" }}
                    onClick={() => void markOne(n.id)}
                  >
                    Mark read
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {nextCursor ? (
        <button
          type="button"
          className="badge"
          style={{ cursor: "pointer", background: "transparent", marginTop: "1rem" }}
          disabled={busy}
          onClick={() => load(nextCursor, true)}
        >
          Load more
        </button>
      ) : null}
    </section>
  );
}
