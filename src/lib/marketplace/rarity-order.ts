/** Server-side ordering for collection galleries (works across all items, not just one page). */
export type CollectionSort = "newest" | "rarity";

export function parseCollectionSort(raw: string | undefined | null): CollectionSort {
  return raw === "rarity" ? "rarity" : "newest";
}

export function orderCollectionPieces<T extends { id: string; createdAt: number }>(
  pieces: T[],
  rankById: ReadonlyMap<string, { rank: number }> | Record<string, { rank: number } | undefined>,
  sort: CollectionSort,
): T[] {
  const get = (id: string) =>
    rankById instanceof Map ? rankById.get(id) : (rankById as Record<string, { rank: number } | undefined>)[id];
  const byNewest = (a: T, b: T) => b.createdAt - a.createdAt;
  if (sort !== "rarity") return [...pieces].sort(byNewest);
  return [...pieces].sort((a, b) => {
    const ra = get(a.id)?.rank ?? Number.POSITIVE_INFINITY;
    const rb = get(b.id)?.rank ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return byNewest(a, b);
  });
}