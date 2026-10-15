export const PROFILE_VIEW_COOKIE = "fm-profile-view";

export const PROFILE_VIEWS = [
  { id: "gallery", label: "Gallery" },
  { id: "grid", label: "Grid" },
  { id: "list", label: "List" },
] as const;

export type ProfileViewId = (typeof PROFILE_VIEWS)[number]["id"];

export function parseProfileView(
  value: string | null | undefined,
): ProfileViewId {
  return value === "gallery" || value === "grid" || value === "list"
    ? value
    : "grid";
}

/** URL query wins when present; otherwise cookie / stored preference. */
export function resolveProfileView(
  query: string | null | undefined,
  stored: string | null | undefined,
): ProfileViewId {
  if (query === "gallery" || query === "grid" || query === "list") {
    return query;
  }
  return parseProfileView(stored);
}
