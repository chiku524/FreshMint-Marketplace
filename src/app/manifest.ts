import type { MetadataRoute } from "next";
import { BRAND_LOGO_PATH, DEFAULT_DESCRIPTION, SITE_NAME } from "@/lib/seo/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: "FreshMint",
    description: DEFAULT_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#07110d",
    theme_color: "#0d1c15",
    icons: [
      {
        src: BRAND_LOGO_PATH,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
