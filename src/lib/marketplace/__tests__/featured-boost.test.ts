import { describe, expect, it } from "vitest";
import { buildSeedState } from "@/lib/data/seed";
import { FEATURED_BOOST_USD } from "@/lib/fees/featured-boost";
import { selectBoostedFeatured } from "@/lib/marketplace/featured-boost";
import type { Listing } from "@/lib/discovery/types";

function fromSeed(
  patch: Omit<Partial<Listing>, "signals"> & {
    id: string;
    signals?: Partial<Listing["signals"]>;
  },
): Listing {
  const seed = buildSeedState().listings.get("listing-fresh-1");
  if (!seed) throw new Error("missing seed listing");
  return {
    ...seed,
    ...patch,
    delisted: patch.delisted ?? false,
    stage: patch.stage ?? "soft_launch",
    featuredBoostedAt: patch.featuredBoostedAt ?? null,
    signals: { ...seed.signals, ...patch.signals },
  };
}

describe("featured boost", () => {
  it("documents a fixed promotional fee", () => {
    expect(FEATURED_BOOST_USD).toBe(15);
  });

  it("selects boosted public listings without inventing inventory", () => {
    const items = selectBoostedFeatured([
      fromSeed({ id: "a", featuredBoostedAt: 100, stage: "rising_eligible" }),
      fromSeed({ id: "draft", featuredBoostedAt: 200, stage: "draft" }),
      fromSeed({ id: "plain", featuredBoostedAt: null }),
      fromSeed({ id: "b", featuredBoostedAt: 300, stage: "soft_launch" }),
    ]);
    expect(items.map((l) => l.id)).toEqual(["b", "a"]);
  });
});
