"use client";

import {
  PROFILE_VIEW_COOKIE,
  type ProfileViewId,
} from "@/lib/profile-view";
import { useState } from "react";

function persistView(next: ProfileViewId) {
  try {
    window.localStorage.setItem(PROFILE_VIEW_COOKIE, next);
    document.cookie = `${PROFILE_VIEW_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    // preference is session-only
  }
}

function syncUrlQuery(next: ProfileViewId) {
  try {
    const url = new URL(window.location.href);
    if (next === "grid") {
      url.searchParams.delete("view");
    } else {
      url.searchParams.set("view", next);
    }
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    // ignore
  }
}

/**
 * Profile gallery/grid/list preference. Server resolves `?view=` + cookie into
 * `initialView`; client persists toggles to cookie, localStorage, and the URL.
 */
export function useProfileViewMode(initialView: ProfileViewId = "grid") {
  const [view, setView] = useState<ProfileViewId>(initialView);
  const [seed, setSeed] = useState(initialView);

  if (initialView !== seed) {
    setSeed(initialView);
    setView(initialView);
  }

  const select = (next: ProfileViewId) => {
    setView(next);
    persistView(next);
    syncUrlQuery(next);
  };

  return { view, select };
}
