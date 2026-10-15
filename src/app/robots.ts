import type { MetadataRoute } from "next";
import { appBaseUrl } from "@/lib/auth/paths";

export default function robots(): MetadataRoute.Robots {
  const base = appBaseUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/me", "/moderate", "/studio", "/notifications", "/sign-in", "/sign-up"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}