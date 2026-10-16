/** Only allow same-origin relative redirects. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/me";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/me";
  }
  // Browsers strip tab/CR/LF inside URLs ("/\t/evil.com" -> "//evil.com");
  // reject any control character outright.
  if (/[\u0000-\u001f\u007f]/.test(value)) return "/me";
  // Final guard: the path must resolve to our own origin.
  try {
    const base = "https://freshmint.invalid";
    const resolved = new URL(value, base);
    if (resolved.origin !== base) return "/me";
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return "/me";
  }
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

export function absoluteAppUrl(path: string, requestUrl?: string): URL {
  const dest = path.startsWith("/") ? path : `/${path}`;
  return new URL(dest, `${appBaseUrl(requestUrl)}/`);
}
