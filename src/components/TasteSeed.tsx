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
    <div className="fm-taste-seed">
      <p className="fm-taste-seed__label">
        Pick a few tastes for Emerging — not someone else’s follow graph.
      </p>
      <div className="fm-taste-seed__tags">
        {DISCOVERY_CONFIG.taste.seedTags.map((tag) => {
          const on = tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              className={`fm-taste-seed__tag${on ? " is-on" : ""}`}
              onClick={() => void toggle(tag)}
              disabled={saving}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
