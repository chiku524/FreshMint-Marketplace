import { describe, expect, it } from "vitest";
import { listingPagePath } from "@/lib/marketplace/listing-href";

describe("listingPagePath", () => {
  it("points at the full listing page, not a modal hash", () => {
    expect(listingPagePath("abc")).toBe("/listings/abc");
  });
});
