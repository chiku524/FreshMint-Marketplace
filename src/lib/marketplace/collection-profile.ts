/** Collection profile media + social link helpers (OpenSea-like header fields). */

export const COLLECTION_DESCRIPTION_MAX = 2000;
export const COLLECTION_LINK_MAX = 2048;

export type CollectionProfileFields = {
  description?: string;
  imageUrl?: string | null;
  bannerUrl?: string | null;
  websiteUrl?: string | null;
  twitterUrl?: string | null;
  discordUrl?: string | null;
  instagramUrl?: string | null;
};

export type CollectionProfileIssue =
  | "description_too_long"
  | "invalid_image_url"
  | "invalid_banner_url"
  | "invalid_website_url"
  | "invalid_twitter_url"
  | "invalid_discord_url"
  | "invalid_instagram_url";

function emptyToNull(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  return t ? t : null;
}

/** Allow http(s) absolute URLs or same-origin /uploads paths from media upload. */
export function sanitizeCollectionMediaUrl(
  raw: string | null | undefined,
): string | null {
  const v = emptyToNull(raw);
  if (v == null) return null;
  if (v.startsWith("/uploads/")) {
    if (v.length > COLLECTION_LINK_MAX) return null;
    if (v.includes("..") || v.includes("//")) return null;
    return v;
  }
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const out = u.toString();
    return out.length <= COLLECTION_LINK_MAX ? out : null;
  } catch {
    return null;
  }
}

export function sanitizeCollectionSocialUrl(
  raw: string | null | undefined,
): string | null {
  const v = emptyToNull(raw);
  if (v == null) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const out = u.toString();
    return out.length <= COLLECTION_LINK_MAX ? out : null;
  } catch {
    return null;
  }
}

export function normalizeCollectionDescription(raw: string | undefined): string {
  if (raw == null) return "";
  return String(raw).trim().slice(0, COLLECTION_DESCRIPTION_MAX);
}

export function validateCollectionProfileFields(
  input: CollectionProfileFields,
):
  | { ok: true; data: Required<CollectionProfileFields> | CollectionProfileFields }
  | { ok: false; issues: CollectionProfileIssue[] } {
  const issues: CollectionProfileIssue[] = [];
  const data: CollectionProfileFields = {};

  if (input.description !== undefined) {
    if (String(input.description).length > COLLECTION_DESCRIPTION_MAX) {
      issues.push("description_too_long");
    } else {
      data.description = normalizeCollectionDescription(input.description);
    }
  }

  const mediaKeys = [
    ["imageUrl", "invalid_image_url"],
    ["bannerUrl", "invalid_banner_url"],
  ] as const;
  for (const [key, issue] of mediaKeys) {
    if (input[key] !== undefined) {
      if (input[key] === null || input[key] === "") {
        data[key] = null;
      } else {
        const sanitized = sanitizeCollectionMediaUrl(input[key]);
        if (sanitized == null) issues.push(issue);
        else data[key] = sanitized;
      }
    }
  }

  const socialKeys = [
    ["websiteUrl", "invalid_website_url"],
    ["twitterUrl", "invalid_twitter_url"],
    ["discordUrl", "invalid_discord_url"],
    ["instagramUrl", "invalid_instagram_url"],
  ] as const;
  for (const [key, issue] of socialKeys) {
    if (input[key] !== undefined) {
      if (input[key] === null || input[key] === "") {
        data[key] = null;
      } else {
        const sanitized = sanitizeCollectionSocialUrl(input[key]);
        if (sanitized == null) issues.push(issue);
        else data[key] = sanitized;
      }
    }
  }

  if (issues.length) return { ok: false, issues };
  return { ok: true, data };
}

export type CollectionSocialLink = {
  key: "website" | "twitter" | "discord" | "instagram";
  label: string;
  href: string;
};

export function collectionSocialLinks(collection: {
  websiteUrl?: string | null;
  twitterUrl?: string | null;
  discordUrl?: string | null;
  instagramUrl?: string | null;
}): CollectionSocialLink[] {
  const out: CollectionSocialLink[] = [];
  if (collection.websiteUrl?.trim()) {
    out.push({
      key: "website",
      label: "Website",
      href: collection.websiteUrl.trim(),
    });
  }
  if (collection.twitterUrl?.trim()) {
    out.push({
      key: "twitter",
      label: "X",
      href: collection.twitterUrl.trim(),
    });
  }
  if (collection.discordUrl?.trim()) {
    out.push({
      key: "discord",
      label: "Discord",
      href: collection.discordUrl.trim(),
    });
  }
  if (collection.instagramUrl?.trim()) {
    out.push({
      key: "instagram",
      label: "Instagram",
      href: collection.instagramUrl.trim(),
    });
  }
  return out;
}
