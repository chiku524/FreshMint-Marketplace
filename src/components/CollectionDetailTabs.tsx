"use client";

import { useState, type ReactNode } from "react";

type TabId = "items" | "activity" | "about";

export function CollectionDetailTabs({
  items,
  activity,
  about,
  itemCount,
  activityCount,
}: {
  items: ReactNode;
  activity?: ReactNode;
  about: ReactNode;
  itemCount: number;
  activityCount?: number;
}) {
  const [tab, setTab] = useState<TabId>("items");
  const hasActivity = activity != null;

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
        {hasActivity ? (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "activity"}
            className={tab === "activity" ? "is-active" : undefined}
            onClick={() => setTab("activity")}
          >
            Activity
            {typeof activityCount === "number" ? (
              <span className="collection-tabs__count">{activityCount}</span>
            ) : null}
          </button>
        ) : null}
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
      {hasActivity ? (
        <div
          role="tabpanel"
          className="collection-tabs__panel"
          hidden={tab !== "activity"}
        >
          {activity}
        </div>
      ) : null}
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
