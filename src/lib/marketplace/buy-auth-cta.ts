/**
 * Buy CTA while FreshMint session is loading / known (session-first).
 * undefined = auth still loading; null = signed out; string = signed in.
 */
export function resolveBuyAuthCta(
  sessionUserId: string | null | undefined,
): "checking" | "sign_in" | "ready" {
  if (sessionUserId === undefined) return "checking";
  if (sessionUserId === null) return "sign_in";
  return "ready";
}
