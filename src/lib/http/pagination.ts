/** Parse ?limit=&cursor= (offset cursor) with sane bounds. */
export function parsePage(
  params: URLSearchParams,
  opts: { defaultLimit: number; maxLimit: number },
): { limit: number; offset: number } {
  const rawLimit = Number(params.get("limit") ?? opts.defaultLimit);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(1, Math.floor(rawLimit)), opts.maxLimit)
    : opts.defaultLimit;
  const rawOffset = Number(params.get("cursor") ?? 0);
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
}

export function nextCursor(offset: number, limit: number, total: number): string | null {
  return offset + limit < total ? String(offset + limit) : null;
}