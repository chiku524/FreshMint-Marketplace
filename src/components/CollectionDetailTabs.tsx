"use client";

import { useState, type ReactNode } from "react";

type TabId = "items" | "about";

export function CollectionDetailTabs({
  items,
  about,
  itemCount,
}: {
  items: ReactNode;
  about: ReactNode;
  itemCount: number;
}) {
  const [tab, setTab] = useState<TabId>("items");

  return (
    <div className="collection-tabs">
      <div className="collection-tabs__nav" role="tablist" aria-label="Collection sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "items"}
          className={tab === "items" ? "is-active" : undefined}
          onClick={() => setTab("items")}
        >
          Items
          <span className="collection-tabs__count">{itemCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "about"}
          className={tab === "about" ? "is-active" : undefined}
          onClick={() => setTab("about")}
        >
          About
        </button>
      </div>
      <div
        role="tabpanel"
        className="collection-tabs__panel"
        hidden={tab !== "items"}
      >
        {items}
      </div>
      <div
        role="tabpanel"
        className="collection-tabs__panel"
        hidden={tab !== "about"}
      >
        {about}
      </div>
    </div>
  );
}
