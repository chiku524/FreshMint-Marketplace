/** Only allow same-origin relative redirects. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/me";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/me";
  }
  return value;
}

function httpsOrigin(host: string): string {
  const trimmed = host.replace(/\/$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

export function appBaseUrl(requestUrl?: string): string {
  // Next.js request.url is often http://localhost:3000 on Vercel — use the public host.
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL_ENV === "production" && vercelProd) {
    return httpsOrigin(vercelProd);
  }
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    return httpsOrigin(vercelUrl);
  }

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
