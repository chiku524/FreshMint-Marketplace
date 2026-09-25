import {
  creatorsSortHref,
  type CreatorsSortId,
} from "@/lib/marketplace/creators-browse-config";
import Link from "next/link";

const TABS: Array<{ id: CreatorsSortId; label: string }> = [
  { id: "top", label: "Top (7d)" },
  { id: "new", label: "New" },
  { id: "all_time", label: "All-time volume" },
];

export function CreatorsSortTabs({ active }: { active: CreatorsSortId }) {
  return (
    <div className="fm-filter-tabs" role="tablist" aria-label="Creators sort">
      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={creatorsSortHref(tab.id)}
            role="tab"
            aria-selected={selected}
            className={`fm-filter-tab${selected ? " is-active" : ""}`}
            scroll={false}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
