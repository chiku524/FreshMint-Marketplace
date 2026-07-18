import { describe, expect, it } from "vitest";
import { DISCOVERY_CONFIG } from "@/lib/discovery/config";
import { validateDropWindow } from "@/lib/marketplace/calendar";

describe("Calendar congestion caps", () => {
  it("rejects inverted and too-short OE windows", async () => {
    const now = Date.now();
    const inverted = await validateDropWindow({
      type: "open_edition",
      startsAt: now + 10_000,
      endsAt: now,
    });
    expect(inverted.ok).toBe(false);
    expect(inverted.errors).toContain("window_end_before_start");

    const tooShort = await validateDropWindow({
      type: "open_edition",
      startsAt: now,
      endsAt: now + 1000,
    });
    expect(tooShort.ok).toBe(false);
    expect(tooShort.errors).toContain("oe_window_too_short");
  });

  it("accepts a valid auction window", async () => {
    const now = Date.now();
    const ok = await validateDropWindow({
      type: "auction",
      startsAt: now + 60_000,
      endsAt: now + 60_000 + DISCOVERY_CONFIG.calendar.minAuctionWindowMs,
    });
    expect(ok.ok).toBe(true);
  });
});

describe("Sybil config locks", () => {
  it("exposes rate limits used by signal resistance", () => {
    expect(DISCOVERY_CONFIG.sybil.maxSignalsPerViewerListingPerHour).toBeGreaterThan(0);
    expect(DISCOVERY_CONFIG.sybil.washPurchaseThreshold).toBeGreaterThan(1);
    expect(DISCOVERY_CONFIG.calendar.maxOeStartsPerHour).toBeGreaterThan(0);
  });
});
