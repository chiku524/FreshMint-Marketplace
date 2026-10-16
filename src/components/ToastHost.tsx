"use client";

import { TOAST_EVENT, type ToastDetail } from "@/lib/client/toast";
import Link from "next/link";
import { useEffect, useState } from "react";

const TTL_MS = 4200;

export function ToastHost() {
  const [items, setItems] = useState<ToastDetail[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      setItems((cur) => [...cur.slice(-2), detail]);
      window.setTimeout(() => {
        setItems((cur) => cur.filter((t) => t.id !== detail.id));
      }, TTL_MS);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  return (
    <div className="fm-toasts" aria-live="polite" aria-atomic="false">
      {items.map((t) => (
        <div key={t.id} className={`fm-toast fm-toast--${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
          <span>{t.text}</span>
          {t.href ? (
            <Link href={t.href} className="fm-toast__link">
              {t.hrefLabel ?? "Open"}
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  );
}