import { describe, expect, it } from "vitest";
import {
  collectionTitleIssueMessage,
  normalizeCollectionTitle,
  validateCollectionTitleFormat,
} from "@/lib/marketplace/collection-title";

describe("collection-title", () => {
  it("normalizes case and whitespace for uniqueness", () => {
    expect(normalizeCollectionTitle("  Dawn   Set ")).toBe("dawn set");
    expect(normalizeCollectionTitle("DAWN SET")).toBe("dawn set");
    expect(normalizeCollectionTitle("dawn set")).toBe("dawn set");
  });

  it("validates length and returns display + normalized forms", () => {
    expect(validateCollectionTitleFormat("")).toEqual({
      ok: false,
      issue: "empty",
    });
    expect(validateCollectionTitleFormat("   ")).toEqual({
      ok: false,
      issue: "empty",
    });
    expect(validateCollectionTitleFormat("x".repeat(121))).toEqual({
      ok: false,
      issue: "too_long",
    });
    expect(validateCollectionTitleFormat("  Dawn  Set ")).toEqual({
      ok: true,
      title: "Dawn Set",
      normalized: "dawn set",
    });
  });

  it("has readable issue messages", () => {
    expect(collectionTitleIssueMessage("taken")).toMatch(/taken/i);
  });
});
