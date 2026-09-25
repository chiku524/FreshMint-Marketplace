import { describe, expect, it } from "vitest";
import { canListResale, previewResaleFees } from "@/lib/marketplace/resale";
import {
  ACTIVE_SELLER_MIN_VOLUME_USD,
  isActiveSeller,
  NEW_CREATOR_DAILY_PUBLISH_LIMIT,
  shouldRateLimitPublishes,
} from "@/lib/marketplace/trust";

describe("trust badges / publish limits", () => {
  it("documents Active seller threshold", () => {
    expect(ACTIVE_SELLER_MIN_VOLUME_USD).toBe(100);
    expect(isActiveSeller(99.99)).toBe(false);
    expect(isActiveSeller(100)).toBe(true);
    expect(NEW_CREATOR_DAILY_PUBLISH_LIMIT).toBe(3);
  });

  it("rate-limits new and low-trust accounts", () => {
    const now = 1_700_000_000_000;
    expect(
      shouldRateLimitPublishes({
        curatorScore: 10,
        walletCreatedAtMs: now - 1000,
        now,
      }),
    ).toBe(true);
    expect(
      shouldRateLimitPublishes({
        curatorScore: 40,
        walletCreatedAtMs: now - 60 * 24 * 60 * 60 * 1000,
        now,
      }),
    ).toBe(false);
  });
});

describe("resale fee preview", () => {
  it("splits platform 0.5% + creator royalty from listed price", () => {
    const preview = previewResaleFees({ amountUsd: 100, creatorRoyaltyBps: 500 });
    expect(preview.platformFeeUsd).toBe(0.5);
    expect(preview.creatorRoyaltyUsd).toBe(5);
    expect(preview.sellerNetUsd).toBe(94.5);
  });

  it("guards resale ownership", () => {
    expect(
      canListResale({
        actorId: "u1",
        purchase: { buyerId: "u1", status: "completed", listingId: "l1" },
        originListing: { id: "l1" },
        existingSecondaryForOrigin: false,
      }).ok,
    ).toBe(true);
    expect(
      canListResale({
        actorId: "u2",
        purchase: { buyerId: "u1", status: "completed", listingId: "l1" },
        originListing: { id: "l1" },
        existingSecondaryForOrigin: false,
      }).ok,
    ).toBe(false);
  });
});
