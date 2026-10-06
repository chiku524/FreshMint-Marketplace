import type { Metadata } from "next";
import { appBaseUrl } from "@/lib/auth/paths";
import { listingHasPublicSurface } from "@/lib/marketplace/listing-manage";
import { collectionHref } from "@/lib/marketplace/collection-slug";

export const SITE_NAME = "FreshMint Marketplace";
export const TITLE_TEMPLATE = "%s — FreshMint Marketplace";
export const DEFAULT_TITLE = "FreshMint Marketplace — Fair Discovery for Digital Art";
export const DEFAULT_DESCRIPTION =
  "NFT marketplace for EVM and Solana with Emerging quotas, composed feeds, and anti-congestion discovery.";
export const OG_TAGLINE = "Fair discovery for newer artists.";
export const SITE_KEYWORDS = [
  "NFT marketplace",
  "FreshMint",
  "emerging artists",
  "digital art",
  "EVM",
  "Solana",
  "fair discovery",
];

export const BRAND_LOGO_PATH = "/freshmint-icon.svg";

export const ROBOTS_DISALLOW = [
  "/me",
  "/me/",
  "/create",
  "/sign-in",
  "/sign-up",
  "/notifications",
  "/studio",
  "/moderate",
] as const;

export const SITEMAP_PATHS = [
  "/",
  "/featured",
  "/rising",
  "/open",
  "/calendar",
  "/creators",
  "/collections",
  "/search",
  "/docs",
  "/trending",
  "/auctions",
  "/bridge",
  "/shelves",
  "/metrics",
] as const;

export function applyTitleTemplate(pageTitle: string): string {
  return TITLE_TEMPLATE.replace("%s", pageTitle);
}

export function brandLogoUrl(base = appBaseUrl()): string {
  return new URL(BRAND_LOGO_PATH, `${base.replace(/\/$/, "")}/`).toString();
}

export function absoluteAssetUrl(
  src: string | null | undefined,
  base = appBaseUrl(),
): string | undefined {
  if (!src) return undefined;
  const trimmed = src.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed;
  if (trimmed.startsWith("/")) {
    return new URL(trimmed, `${base.replace(/\/$/, "")}/`).toString();
  }
  return undefined;
}

export function organizationJsonLd(base = appBaseUrl()) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: base,
    logo: brandLogoUrl(base),
  };
}

export function websiteJsonLd(base = appBaseUrl()) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: base,
    description: DEFAULT_DESCRIPTION,
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: brandLogoUrl(base) },
    },
  };
}

export function siteJsonLdGraph(base = appBaseUrl()) {
  return [organizationJsonLd(base), websiteJsonLd(base)];
}

export const noIndexRobots = {
  index: false,
  follow: false,
} as const;

export function noIndexMetadata(title: string, description?: string): Metadata {
  return {
    title,
    ...(description ? { description } : {}),
    robots: noIndexRobots,
  };
}

export function rootSiteMetadata(): Metadata {
  const base = appBaseUrl();
  return {
    metadataBase: new URL(base),
    applicationName: SITE_NAME,
    title: {
      default: DEFAULT_TITLE,
      template: TITLE_TEMPLATE,
    },
    description: DEFAULT_DESCRIPTION,
    keywords: [...SITE_KEYWORDS],
    icons: {
      icon: [{ url: BRAND_LOGO_PATH, type: "image/svg+xml" }],
      apple: "/apple-icon",
    },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: SITE_NAME,
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
    },
    twitter: {
      card: "summary_large_image",
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
    },
  };
}

type ListingSeoInput = {
  title: string;
  description?: string | null;
  stage: string;
  delisted: boolean;
  mediaUrl?: string | null;
  tokenId?: string | null;
  contractAddress?: string | null;
  mintTxHash?: string | null;
};

export function listingIsIndexable(listing: ListingSeoInput): boolean {
  if (listing.stage === "draft") return false;
  if (listing.delisted && !listingHasPublicSurface(listing)) return false;
  return true;
}

export function listingPageMetadata(
  listing: ListingSeoInput | null | undefined,
): Metadata {
  if (!listing) {
    return noIndexMetadata("Listing");
  }
  const title = listing.title;
  const description =
    listing.description?.trim() ||
    `${listing.title} on FreshMint Marketplace.`;
  const publicOk = listingIsIndexable(listing);
  const image = publicOk ? absoluteAssetUrl(listing.mediaUrl) : undefined;
  return {
    title,
    description,
    robots: publicOk ? { index: true, follow: true } : noIndexRobots,
    ...(image
      ? {
          openGraph: {
            title,
            description,
            images: [{ url: image }],
          },
          twitter: {
            card: "summary_large_image" as const,
            title,
            description,
            images: [image],
          },
        }
      : {}),
  };
}

type CollectionSeoInput = {
  id: string;
  title: string;
  slug?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  bannerUrl?: string | null;
  coverUrl?: string | null;
};

export function collectionPageMetadata(collection: CollectionSeoInput | null): Metadata {
  if (!collection) {
    return noIndexMetadata("Collection");
  }
  const title = collection.title;
  const description =
    collection.description?.trim() ||
    `${collection.title} — a collection on FreshMint Marketplace.`;
  const image = absoluteAssetUrl(
    collection.imageUrl || collection.bannerUrl || collection.coverUrl,
  );
  return {
    title,
    description,
    alternates: { canonical: collectionHref(collection) },
    ...(image
      ? {
          openGraph: {
            title,
            description,
            images: [{ url: image }],
          },
          twitter: {
            card: "summary_large_image" as const,
            title,
            description,
            images: [image],
          },
        }
      : {}),
  };
}

type CreatorSeoInput = {
  displayName: string;
  bio?: string | null;
  avatarUrl?: string | null;
};

export function creatorPageMetadata(creator: CreatorSeoInput | null): Metadata {
  if (!creator) {
    return noIndexMetadata("Creator");
  }
  const title = creator.displayName;
  const description =
    creator.bio?.trim() ||
    `${creator.displayName} on FreshMint Marketplace.`;
  const image = absoluteAssetUrl(creator.avatarUrl);
  return {
    title,
    description,
    ...(image
      ? {
          openGraph: {
            title,
            description,
            images: [{ url: image }],
          },
          twitter: {
            card: "summary_large_image" as const,
            title,
            description,
            images: [image],
          },
        }
      : {}),
  };
}
