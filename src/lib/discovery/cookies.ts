import { cookies } from "next/headers";
import { DISCOVERY_CONFIG } from "./config";
import type { ViewerTaste } from "./taste";
import {
  appendSeenFromFeed,
  emptySession,
  parseSeenCookie,
  parseTasteCookie,
  serializeSeenCookie,
  serializeTasteCookie,
} from "./viewer-session";
import type { SessionContext } from "./types";

export async function readViewerSession(
  viewerId: string | null = null,
): Promise<SessionContext> {
  const jar = await cookies();
  return parseSeenCookie(
    jar.get(DISCOVERY_CONFIG.viewerSession.cookieName)?.value,
    viewerId,
  );
}

export async function writeViewerSession(session: SessionContext): Promise<void> {
  const jar = await cookies();
  const expires = new Date(
    Date.now() + DISCOVERY_CONFIG.viewerSession.ttlSeconds * 1000,
  );
  jar.set(DISCOVERY_CONFIG.viewerSession.cookieName, serializeSeenCookie(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function readViewerTaste(): Promise<ViewerTaste> {
  const jar = await cookies();
  return parseTasteCookie(
    jar.get(DISCOVERY_CONFIG.viewerSession.tasteCookieName)?.value,
  );
}

export async function writeViewerTaste(taste: ViewerTaste): Promise<void> {
  const jar = await cookies();
  const expires = new Date(
    Date.now() + DISCOVERY_CONFIG.viewerSession.ttlSeconds * 1000,
  );
  jar.set(
    DISCOVERY_CONFIG.viewerSession.tasteCookieName,
    serializeTasteCookie(taste),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires,
    },
  );
}

export async function clearViewerTaste(): Promise<void> {
  const jar = await cookies();
  jar.delete(DISCOVERY_CONFIG.viewerSession.tasteCookieName);
}

export { emptySession, appendSeenFromFeed };
