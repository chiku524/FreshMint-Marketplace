import { describe, expect, it } from "vitest";
import {
  collectionHref,
  collectionSlugIssueMessage,
  normalizeCollectionSlug,
  suggestCollectionSlug,
  validateCollectionSlugFormat,
} from "@/lib/marketplace/collection-slug";

describe("collection-slug", () => {
  it("normalizes titles into url-safe slugs", () => {
    expect(suggestCollectionSlug("Dawn Set")).toBe("dawn-set");
    expect(normalizeCollectionSlug("  Hello--World!! ")).toBe("hello-world");
    expect(normalizeCollectionSlug("Nico's Garden")).toBe("nicos-garden");
  });

  it("rejects reserved, short, and invalid formats", () => {
    expect(validateCollectionSlugFormat("new")).toEqual({
      ok: false,
      issue: "reserved",
    });
    expect(validateCollectionSlugFormat("ab")).toEqual({
      ok: false,
      issue: "too_short",
    });
    expect(validateCollectionSlugFormat("---")).toEqual({
      ok: false,
      issue: "empty",
    });
    expect(validateCollectionSlugFormat("good-slug")).toEqual({
      ok: true,
      slug: "good-slug",
    });
  });

  it("builds collection href preferring slug", () => {
    expect(collectionHref({ id: "cuid123", slug: "dawn-set" })).toBe(
      "/collections/dawn-set",
    );
    expect(collectionHref({ id: "cuid123", slug: null })).toBe(
      "/collections/cuid123",
    );
  });

  it("has readable issue messages", () => {
    expect(collectionSlugIssueMessage("taken")).toMatch(/taken/i);
  });
});
