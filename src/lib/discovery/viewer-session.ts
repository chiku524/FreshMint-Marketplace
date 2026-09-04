import { DISCOVERY_CONFIG } from "./config";
import type { SessionContext } from "./types";
import { normalizeTaste, type ViewerTaste } from "./taste";

export function emptySession(viewerId: string | null = null): SessionContext {
  return {
    viewerId,
    seenArtistIds: [],
    seenListingIds: [],
    seenCollectionIds: [],
    itemsOnCurrentScreen: [],
  };
}

export function mergeSession(
  base: SessionContext,
  extra: Partial<SessionContext> | null | undefined,
): SessionContext {
  if (!extra) return base;
  const cap = DISCOVERY_CONFIG.viewerSession.maxIds;
  const uniq = (ids: string[]) => [...new Set(ids)].slice(-cap);
  return {
    viewerId: extra.viewerId ?? base.viewerId,
    seenArtistIds: uniq([...base.seenArtistIds, ...(extra.seenArtistIds ?? [])]),
    seenListingIds: uniq([...base.seenListingIds, ...(extra.seenListingIds ?? [])]),
    seenCollectionIds: uniq([
      ...base.seenCollectionIds,
      ...(extra.seenCollectionIds ?? []),
    ]),
    itemsOnCurrentScreen: extra.itemsOnCurrentScreen ?? base.itemsOnCurrentScreen,
  };
}

export function sessionFromSeenPayload(input: {
  viewerId?: string | null;
  artistIds?: string[];
  listingIds?: string[];
  collectionIds?: string[];
}): SessionContext {
  return mergeSession(emptySession(input.viewerId ?? null), {
    seenArtistIds: input.artistIds ?? [],
    seenListingIds: input.listingIds ?? [],
    seenCollectionIds: input.collectionIds ?? [],
  });
}

export function appendSeenFromFeed(
  session: SessionContext,
  items: { listing: { id: string; creatorId: string; collectionId: string | null } }[],
): SessionContext {
  return mergeSession(session, {
    seenArtistIds: items.map((i) => i.listing.creatorId),
    seenListingIds: items.map((i) => i.listing.id),
    seenCollectionIds: items
      .map((i) => i.listing.collectionId)
      .filter((id): id is string => !!id),
    itemsOnCurrentScreen: items.map((i) => ({
      artistId: i.listing.creatorId,
      collectionId: i.listing.collectionId,
    })),
  });
}

export function serializeSeenCookie(session: SessionContext): string {
  const cap = DISCOVERY_CONFIG.viewerSession.maxIds;
  let artistIds = session.seenArtistIds.slice(-cap);
  let listingIds = session.seenListingIds.slice(-cap);
  let collectionIds = session.seenCollectionIds.slice(-cap);
  let raw = JSON.stringify({ artistIds, listingIds, collectionIds });
  // Browsers drop cookies over ~4KB; a large seen-list can evict the auth cookie.
  while (
    raw.length > 3500 &&
    (artistIds.length || listingIds.length || collectionIds.length)
  ) {
    if (listingIds.length >= artistIds.length && listingIds.length > 0) {
      listingIds = listingIds.slice(1);
    } else if (artistIds.length > 0) {
      artistIds = artistIds.slice(1);
    } else {
      collectionIds = collectionIds.slice(1);
    }
    raw = JSON.stringify({ artistIds, listingIds, collectionIds });
  }
  return raw;
}

export function parseSeenCookie(
  raw: string | undefined,
  viewerId: string | null = null,
): SessionContext {
  if (!raw) return emptySession(viewerId);
  try {
    const parsed = JSON.parse(raw) as {
      artistIds?: string[];
      listingIds?: string[];
      collectionIds?: string[];
    };
    return sessionFromSeenPayload({
      viewerId,
      artistIds: Array.isArray(parsed.artistIds) ? parsed.artistIds : [],
      listingIds: Array.isArray(parsed.listingIds) ? parsed.listingIds : [],
      collectionIds: Array.isArray(parsed.collectionIds)
        ? parsed.collectionIds
        : [],
    });
  } catch {
    return emptySession(viewerId);
  }
}

export function serializeTasteCookie(taste: ViewerTaste): string {
  return JSON.stringify(normalizeTaste(taste));
}

export function parseTasteCookie(raw: string | undefined): ViewerTaste {
  if (!raw) return { styleTags: [] };
  try {
    return normalizeTaste(JSON.parse(raw) as Partial<ViewerTaste>);
  } catch {
    return { styleTags: [] };
  }
}
