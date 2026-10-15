import type { MetadataRoute } from "next";
import { collectionHref } from "@/lib/marketplace/collection-slug";
import { listingIsIndexable } from "@/lib/seo/site";

/** Keep well under the 50k-URL sitemap limit. */
export const MAX_ENTITY_SITEMAP_URLS = 5_000;

type SitemapListing = Parameters<typeof listingIsIndexable>[0] & {
  id: string;
  createdAt: number;
};
type SitemapCreator = { id: string };
type SitemapCollection = { id: string; slug?: string | null; createdAt?: number | null };

export function buildEntitySitemapEntries(
  base: string,
  input: {
    listings: Iterable<SitemapListing>;
    creators: Iterable<SitemapCreator>;
    collections: Iterable<SitemapCollection>;
  },
  limit = MAX_ENTITY_SITEMAP_URLS,
): MetadataRoute.Sitemap {
  const root = base.replace(/\/$/, "");
  const out: MetadataRoute.Sitemap = [];
  const listings = [...input.listings]
    .filter(listingIsIndexable)
    .sort((a, b) => b.createdAt - a.createdAt);
  for (const c of input.collections) {
    if (out.length >= limit) return out;
    out.push({
      url: `${root}${collectionHref(c)}`,
      ...(c.createdAt ? { lastModified: new Date(c.createdAt) } : {}),
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  for (const c of input.creators) {
    if (out.length >= limit) return out;
    out.push({ url: `${root}/creators/${c.id}`, changeFrequency: "weekly", priority: 0.5 });
  }
  for (const l of listings) {
    if (out.length >= limit) return out;
    out.push({
      url: `${root}/listings/${l.id}`,
      lastModified: new Date(l.createdAt),
      changeFrequency: "weekly",
      priority: 0.5,
    });
  }
  return out;
}
