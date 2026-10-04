import { describe, expect, it } from "vitest";
import {
  collectionSocialLinks,
  sanitizeCollectionMediaUrl,
  sanitizeCollectionSocialUrl,
  validateCollectionProfileFields,
} from "@/lib/marketplace/collection-profile";

describe("collection-profile", () => {
  it("accepts blob uploads and https socials", () => {
    expect(sanitizeCollectionMediaUrl("/uploads/logo.png")).toBe(
      "/uploads/logo.png",
    );
    expect(sanitizeCollectionSocialUrl("https://x.com/freshmint")).toBe(
      "https://x.com/freshmint",
    );
    expect(sanitizeCollectionSocialUrl("ftp://bad.example")).toBeNull();
  });

  it("validates profile patches", () => {
    const ok = validateCollectionProfileFields({
      description: "A quiet garden of static.",
      imageUrl: "/uploads/a.png",
      websiteUrl: "https://example.com",
      twitterUrl: null,
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.data.description).toBe("A quiet garden of static.");
    expect(ok.data.imageUrl).toBe("/uploads/a.png");
    expect(ok.data.twitterUrl).toBeNull();

    const bad = validateCollectionProfileFields({
      websiteUrl: "not-a-url",
    });
    expect(bad.ok).toBe(false);
  });

  it("lists social links in display order", () => {
    expect(
      collectionSocialLinks({
        websiteUrl: "https://example.com",
        twitterUrl: "https://x.com/a",
        discordUrl: null,
        instagramUrl: "https://instagram.com/a",
      }).map((l) => l.key),
    ).toEqual(["website", "twitter", "instagram"]);
  });
});
