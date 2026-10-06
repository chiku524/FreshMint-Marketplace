import type { MetadataRoute } from "next";
import { appBaseUrl } from "@/lib/auth/paths";
import { SITEMAP_PATHS } from "@/lib/seo/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = appBaseUrl().replace(/\/$/, "");
  return SITEMAP_PATHS.map((path) => ({
    url: path === "/" ? `${base}/` : `${base}${path}`,
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
