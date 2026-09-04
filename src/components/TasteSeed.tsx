"use client";

import { DISCOVERY_CONFIG } from "@/lib/discovery/config";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function TasteSeed({
  selected = [],
}: {
  selected?: string[];
}) {
  const router = useRouter();
  const [tags, setTags] = useState<string[]>(selected);
  const [saving, setSaving] = useState(false);

  async function toggle(tag: string) {
    const next = tags.includes(tag)
      ? tags.filter((t) => t !== tag)
      : [...tags, tag].slice(0, 5);
    setTags(next);
    setSaving(true);
    try {
      await fetch("/api/taste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleTags: next }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ margin: "0 0 1.25rem" }}>
      <p style={{ margin: "0 0 0.55rem", color: "var(--ink-muted)", fontSize: "0.92rem" }}>
        Pick a few tastes for Emerging — not someone else’s follow graph.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
        {DISCOVERY_CONFIG.taste.seedTags.map((tag) => {
          const on = tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              className={on ? "badge emerging" : "badge"}
              onClick={() => void toggle(tag)}
              disabled={saving}
              style={{ cursor: "pointer", border: "none" }}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
