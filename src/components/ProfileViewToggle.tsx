"use client";

import {
  PROFILE_VIEWS,
  type ProfileViewId,
} from "@/lib/profile-view";

function ViewIcon({ name }: { name: ProfileViewId }) {
  return (
    <svg
      className="collections-view-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {name === "gallery" ? (
        <>
          <rect x="3.5" y="4.5" width="10" height="10" rx="1.4" />
          <rect x="15.2" y="4.5" width="5.3" height="4.6" rx="1" />
          <rect x="15.2" y="10.7" width="5.3" height="3.8" rx="1" />
          <rect x="3.5" y="16.2" width="17" height="3.3" rx="1" />
        </>
      ) : null}
      {name === "grid" ? (
        <>
          <rect x="4" y="4" width="6.4" height="6.4" rx="1" />
          <rect x="13.6" y="4" width="6.4" height="6.4" rx="1" />
          <rect x="4" y="13.6" width="6.4" height="6.4" rx="1" />
          <rect x="13.6" y="13.6" width="6.4" height="6.4" rx="1" />
        </>
      ) : null}
      {name === "list" ? (
        <>
          <path d="M8.5 7H20" />
          <path d="M8.5 12H20" />
          <path d="M8.5 17H20" />
          <rect x="3.6" y="5.6" width="2.6" height="2.6" rx="0.5" />
          <rect x="3.6" y="10.6" width="2.6" height="2.6" rx="0.5" />
          <rect x="3.6" y="15.6" width="2.6" height="2.6" rx="0.5" />
        </>
      ) : null}
    </svg>
  );
}

export function ProfileViewToggle({
  view,
  onChange,
  label = "Profile view",
}: {
  view: ProfileViewId;
  onChange: (next: ProfileViewId) => void;
  label?: string;
}) {
  return (
    <div className="collections-views" role="toolbar" aria-label={label}>
      {PROFILE_VIEWS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={view === option.id ? "is-active" : undefined}
          aria-pressed={view === option.id}
          onClick={() => onChange(option.id)}
        >
          <ViewIcon name={option.id} />
          {option.label}
        </button>
      ))}
    </div>
  );
}
