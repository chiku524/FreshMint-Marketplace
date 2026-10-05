import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetMemoryOffersForTests,
  acceptOffer,
  cancelOffer,
  listOffersForListing,
  makeOffer,
} from "@/lib/marketplace/offers";

describe("offers (memory)", () => {
  beforeEach(() => {
    __resetMemoryOffersForTests();
  });

  it("rejects offers on missing listings", async () => {
    const result = await makeOffer({
      listingId: "missing",
      offererId: "buyer-1",
      amountUsd: 10,
    });
    expect(result.ok).toBe(false);
  });

  it("lists empty offers for unknown listing", async () => {
    const offers = await listOffersForListing("none");
    expect(offers).toEqual([]);
  });

  it("cancel requires offerer", async () => {
    const result = await cancelOffer({
      offerId: "nope",
      actorId: "u1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("not_found");
  });

  it("accept requires existing open offer", async () => {
    const result = await acceptOffer({
      offerId: "nope",
      actorId: "seller",
    });
    expect(result.ok).toBe(false);
  });
});
