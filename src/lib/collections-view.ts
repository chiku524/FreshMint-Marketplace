export const COLLECTIONS_VIEW_COOKIE = "fm-collections-view";

export const COLLECTIONS_VIEWS = [
  { id: "gallery", label: "Gallery" },
  { id: "grid", label: "Grid" },
  { id: "list", label: "List" },
] as const;

export type CollectionsViewId = (typeof COLLECTIONS_VIEWS)[number]["id"];

export function parseCollectionsView(
  value: string | null | undefined,
): CollectionsViewId {
  return value === "gallery" || value === "grid" || value === "list"
    ? value
    : "gallery";
}
