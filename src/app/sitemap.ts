import type { MetadataRoute } from "next";
import { appBaseUrl } from "@/lib/auth/paths";
import { SITEMAP_PATHS } from "@/lib/seo/site";
import { buildEntitySitemapEntries } from "@/lib/seo/sitemap-entries";

// Regenerate hourly instead of on every crawler hit.
export const revalidate = 3600;

const ENTITY_TIMEOUT_MS = 5_000;

async function entityEntries(base: string): Promise<MetadataRoute.Sitemap> {
  try {
    const { getDiscoveryEngine } = await import("@/lib/marketplace/service");
    const engine = await Promise.race([
      getDiscoveryEngine(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("sitemap_engine_timeout")), ENTITY_TIMEOUT_MS),
      ),
    ]);
    return buildEntitySitemapEntries(base, {
      listings: engine.state.listings.values(),
      creators: engine.state.creators.values(),
      collections: engine.state.collections.values(),
    });
  } catch (e) {
    // DB unavailable (e.g. at build): fall back to the static public routes.
    console.warn("[sitemap] entity entries skipped:", e instanceof Error ? e.message : e);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appBaseUrl().replace(/\/$/, "");
  const staticEntries: MetadataRoute.Sitemap = SITEMAP_PATHS.map((path) => ({
    url: path === "/" ? `${base}/` : `${base}${path}`,
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));
  return [...staticEntries, ...(await entityEntries(base))];
}
