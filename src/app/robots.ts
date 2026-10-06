import type { MetadataRoute } from "next";
import { appBaseUrl } from "@/lib/auth/paths";
import { ROBOTS_DISALLOW } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
  const base = appBaseUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...ROBOTS_DISALLOW],
    },
    sitemap: `${base.replace(/\/$/, "")}/sitemap.xml`,
    host: base,
  };
}
