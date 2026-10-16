import { describe, expect, it } from "vitest";
import { buildPurchaseSummary, formatDuration } from "./purchase-summary";

const base = {
  saleMode: "fixed",
  listingType: "single",
  displayPriceUsd: 120,
  cap: 1,
  isSold: false,
  delisted: false,
  minted: true,
  isSecondary: false,
  now: 1_000_000,
};

describe("buildPurchaseSummary", () => {
  it("fixed price, available", () => {
    const s = buildPurchaseSummary(base);
    expect(s).toMatchObject({ priceLabel: "Price", amount: "$120", status: "available", supply: "1 of 1" });
  });
  it("explains unminted work instead of a dead button", () => {
    expect(buildPurchaseSummary({ ...base, minted: false }).status).toBe("not_minted");
  });
  it("english auction shows current bid and time left", () => {
    const s = buildPurchaseSummary({
      ...base,
      saleMode: "english",
      listingType: "auction",
      currentHighBidUsd: 300,
      startsAt: 0,
      endsAt: 1_000_000 + 2 * 3600_000,
    });
    expect(s.priceLabel).toBe("Current bid");
    expect(s.amount).toBe("$300");
    expect(s.timing).toBe("Ends in 2h 0m");
  });
  it("sold and upcoming states", () => {
    expect(buildPurchaseSummary({ ...base, isSold: true }).statusText).toBe("Sold out");
    expect(buildPurchaseSummary({ ...base, startsAt: 2_000_000 }).status).toBe("upcoming");
  });
  it("formats durations", () => {
    expect(formatDuration(90_000_000)).toBe("1d 1h");
    expect(formatDuration(30_000)).toBe("1m");
  });
});