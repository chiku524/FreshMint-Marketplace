/** Only allow same-origin relative redirects. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/me";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/me";
  }
  return value;
}

export function appBaseUrl(requestUrl?: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (requestUrl) {
    try {
      return new URL(requestUrl).origin;
    } catch {
      // fall through
    }
  }
  return "http://localhost:3000";
}
