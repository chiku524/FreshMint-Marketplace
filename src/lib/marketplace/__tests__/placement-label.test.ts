import { describe, expect, it } from "vitest";
import {
  placementBadgeText,
  placementLabel,
} from "@/lib/marketplace/placement-label";

const base = { stage: "rising_eligible" as const, featuredBoostedAt: null as number | null };

describe("placementLabel", () => {
  it("labels paid boost as Promoted over editorial stage", () => {
    expect(
      placementLabel({ stage: "featured", featuredBoostedAt: 1_700_000_000_000 }),
    ).toBe("promoted");
    expect(placementBadgeText("promoted")).toBe("Promoted");
  });

  it("labels editorial Featured without boost", () => {
    expect(placementLabel({ stage: "featured", featuredBoostedAt: null })).toBe(
      "featured",
    );
    expect(placementLabel(base, "featured")).toBe("featured");
    expect(placementBadgeText("featured")).toBe("Featured");
  });

  it("returns null for ordinary rising work", () => {
    expect(placementLabel(base)).toBeNull();
    expect(placementBadgeText(null)).toBeNull();
  });
});
