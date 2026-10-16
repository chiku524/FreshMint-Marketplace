/**
 * Turn API / internal error codes (e.g. "publish_failed") into plain language.
 * Human-readable messages pass through unchanged; anything that looks like a
 * machine code never reaches the user verbatim.
 */
const KNOWN: Record<string, string> = {
  unauthorized: "Please sign in and try again.",
  sign_in: "Please sign in and try again.",
  forbidden: "You don't have permission to do that.",
  not_found: "We couldn't find that. It may have been removed.",
  rate_limited: "Too many attempts. Please wait a moment and try again.",
  too_many_requests: "Too many attempts. Please wait a moment and try again.",
  invalid_body: "Something in the form isn't valid. Check it and try again.",
  invalid_code: "That code isn't right. Check it and try again.",
  invalid_credentials: "Email or password is incorrect.",
  email_taken: "An account with that email already exists.",
  file_too_large: "That file is too large.",
  unsupported_type: "That file type isn't supported.",
  network_error: "Couldn't reach FreshMint. Check your connection and try again.",
  timeout: "That took too long. Please try again.",
};

const ACTION: Record<string, string> = {
  publish: "publish",
  upload: "upload the file",
  update: "save your changes",
  save: "save your changes",
  cancel: "cancel",
  relist: "relist",
  auth: "sign you in",
  verify: "verify the code",
  confirm: "confirm",
  disable: "turn that off",
  regenerate: "make new codes",
  attach: "add that",
  avatar_update: "update your photo",
  buy: "complete the purchase",
  bid: "place the bid",
  offer: "send the offer",
  mint: "mint",
  deploy: "deploy the collection",
  boost: "start the boost",
};

export function looksLikeErrorCode(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= 64 && /^[a-z0-9]+([_.:-][a-z0-9]+)*$/.test(t);
}

export function friendlyError(raw: unknown, fallback?: string): string {
  const text = (raw instanceof Error ? raw.message : typeof raw === "string" ? raw : "").trim();
  const generic = fallback ?? "Something went wrong. Please try again.";
  if (!text) return generic;
  if (/failed to fetch|networkerror|load failed/i.test(text)) return KNOWN.network_error;
  if (!looksLikeErrorCode(text)) return text.length > 160 ? `${text.slice(0, 157)}\u2026` : text;
  const code = text.toLowerCase();
  if (KNOWN[code]) return KNOWN[code];
  const m = code.match(/^(.*)_failed$/);
  if (m && ACTION[m[1]]) return `Couldn't ${ACTION[m[1]]}. Please try again.`;
  return generic;
}
