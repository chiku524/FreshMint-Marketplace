"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

type NotifItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: number | null;
  createdAt: number;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  function refreshCount() {
    void fetch("/api/notifications/unread-count", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count?: number } | null) => {
        if (d && typeof d.count === "number") setUnread(d.count);
      })
      .catch(() => {});
  }

  function loadRecent() {
    setLoading(true);
    void fetch("/api/notifications?limit=8", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items?: NotifItem[] } | null) => {
        setItems(d?.items ?? []);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refreshCount();
    const t = window.setInterval(refreshCount, 60_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    loadRecent();
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, {
      method: "POST",
      credentials: "include",
    });
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: Date.now() } : n)),
    );
    setUnread((c) => Math.max(0, c - 1));
  }

  async function markAll() {
    await fetch("/api/notifications/read-all", {
      method: "POST",
      credentials: "include",
    });
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? Date.now() })));
    setUnread(0);
  }

  return (
    <div
      ref={rootRef}
      className={`site-nav__dropdown notif-bell${open ? " is-open" : ""}`}
    >
      <button
        type="button"
        className="site-nav__trigger notif-bell__trigger"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="notif-bell__icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
            <path d="M10 20a2 2 0 0 0 4 0" />
          </svg>
        </span>
        <span className="site-nav__label">Alerts</span>
        {unread > 0 ? (
          <span className="notif-bell__badge">{unread > 99 ? "99+" : unread}</span>
        ) : null}
      </button>
      <div id={menuId} className="site-nav__menu notif-bell__menu" role="menu">
        <div className="site-nav__menu-panel notif-bell__panel">
          <div className="notif-bell__head">
            <strong>Notifications</strong>
            <button type="button" className="badge" onClick={() => void markAll()}>
              Mark all read
            </button>
          </div>
          {loading && items.length === 0 ? (
            <p className="notif-bell__empty">Loading…</p>
          ) : items.length === 0 ? (
            <p className="notif-bell__empty">No notifications yet.</p>
          ) : (
            <ul className="notif-bell__list">
              {items.map((n) => (
                <li key={n.id} className={n.readAt ? "" : "is-unread"}>
                  {n.href ? (
                    <Link
                      href={n.href}
                      className="notif-bell__item"
                      onClick={() => {
                        if (!n.readAt) void markRead(n.id);
                        setOpen(false);
                      }}
                    >
                      <span className="notif-bell__title">{n.title}</span>
                      {n.body ? (
                        <span className="notif-bell__body">{n.body}</span>
                      ) : null}
                      <span className="notif-bell__time">
                        {new Date(n.createdAt).toLocaleString()}
                      </span>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="notif-bell__item"
                      onClick={() => {
                        if (!n.readAt) void markRead(n.id);
                      }}
                    >
                      <span className="notif-bell__title">{n.title}</span>
                      {n.body ? (
                        <span className="notif-bell__body">{n.body}</span>
                      ) : null}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/notifications"
            className="notif-bell__all"
            onClick={() => setOpen(false)}
          >
            View all
          </Link>
        </div>
      </div>
    </div>
  );
}
