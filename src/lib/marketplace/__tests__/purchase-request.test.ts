import { describe, expect, it } from "vitest";
import {
  prepareBodySchema,
  purchaseBodySchema,
} from "@/lib/marketplace/purchase-request";

describe("purchase body", () => {
  it("accepts a string price from serialized listing props", () => {
    const parsed = purchaseBodySchema.safeParse({
      listingId: "listing-boing-1",
      amountUsd: "32",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.amountUsd).toBe(32);
  });

  it("allows listingId only so the server can use the catalog price", () => {
    const parsed = purchaseBodySchema.safeParse({
      listingId: "listing-fresh-1",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty body", () => {
    expect(purchaseBodySchema.safeParse(null).success).toBe(false);
    expect(purchaseBodySchema.safeParse({}).success).toBe(false);
  });
});

describe("prepare body", () => {
  it("coerces amountUsd for buy", () => {
    const parsed = prepareBodySchema.safeParse({
      listingId: "listing-fresh-1",
      action: "buy",
      amountUsd: "45",
      buyerAddress: "0xabc0000000000000000000000000000000000001",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.amountUsd).toBe(45);
  });
});
