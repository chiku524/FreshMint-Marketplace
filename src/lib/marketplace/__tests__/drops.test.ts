import { describe, expect, it } from "vitest";
import {
  COLLECTION_MEDIA_CAP_BYTES,
  dropWindowFor,
  formatBytes,
  parseTraits,
  primarySupplyCap,
} from "@/lib/marketplace/drops";

describe("drop helpers", () => {
  it("parses traits and ignores blanks", () => {
    expect(
      parseTraits([
        { trait_type: "Background", value: "Gold" },
        { trait_type: "  ", value: "x" },
        { trait_type: "Eyes", value: "Laser" },
      ]),
    ).toEqual([
      { trait_type: "Background", value: "Gold" },
      { trait_type: "Eyes", value: "Laser" },
    ]);
  });

  it("uses maxSupply when set and defaults 1/1 vs unlimited OE", () => {
    expect(primarySupplyCap({ type: "single" })).toBe(1);
    expect(primarySupplyCap({ type: "open_edition" })).toBeNull();
    expect(primarySupplyCap({ type: "open_edition", maxSupply: 50 })).toBe(50);
    expect(primarySupplyCap({ type: "collection", maxSupply: 2 })).toBe(2);
  });

  it("reads listing and collection drop windows", () => {
    const now = 1_000_000;
    const upcoming = dropWindowFor(
      {
        type: "collection",
        oeStartsAt: now + 1000,
        oeEndsAt: now + 5000,
        auctionStartsAt: null,
        auctionEndsAt: null,
      },
      null,
      now,
    );
    expect(upcoming.state).toBe("upcoming");

    const live = dropWindowFor(
      {
        type: "single",
        oeStartsAt: null,
        oeEndsAt: null,
        auctionStartsAt: null,
        auctionEndsAt: null,
      },
      {
        dropKind: "limited",
        dropStartsAt: now - 1000,
        dropEndsAt: now + 1000,
      },
      now,
    );
    expect(live.state).toBe("live");
  });

  it("keeps a 10 GB collection cap", () => {
    expect(COLLECTION_MEDIA_CAP_BYTES).toBe(10 * 1024 * 1024 * 1024);
    expect(formatBytes(COLLECTION_MEDIA_CAP_BYTES)).toContain("GB");
  });
});
