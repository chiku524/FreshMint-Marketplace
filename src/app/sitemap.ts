import type { MetadataRoute } from "next";
import { appBaseUrl } from "@/lib/auth/paths";

/** Public browse surfaces. Kept static so the sitemap never needs DB access. */
const PUBLIC_ROUTES: Array<{ path: string; priority: number }> = [
  { path: "/", priority: 1 },
  { path: "/rising", priority: 0.9 },
  { path: "/trending", priority: 0.9 },
  { path: "/featured", priority: 0.8 },
  { path: "/auctions", priority: 0.8 },
  { path: "/collections", priority: 0.8 },
  { path: "/creators", priority: 0.7 },
  { path: "/open", priority: 0.6 },
  { path: "/shelves", priority: 0.6 },
  { path: "/calendar", priority: 0.6 },
  { path: "/search", priority: 0.5 },
  { path: "/docs", priority: 0.5 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = appBaseUrl();
  return PUBLIC_ROUTES.map(({ path, priority }) => ({
    url: `${base}${path}`,
    changeFrequency: "daily",
    priority,
  }));
}