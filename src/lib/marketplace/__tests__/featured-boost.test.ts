import { beforeEach, describe, expect, it } from "vitest";
import {
  enableMemoryMode,
  getMemoryEngine,
  resetMemoryStoreForTests,
} from "@/lib/data/memory-store";
import { FEATURED_BOOST_USD } from "@/lib/fees/featured-boost";
import {
  boostPayNetworks,
  confirmFeaturedBoost,
  prepareFeaturedBoost,
  selectBoostedFeatured,
} from "@/lib/marketplace/featured-boost";
import type { Listing } from "@/lib/discovery/types";
import { buildSeedState } from "@/lib/data/seed";
import {
  boostConfirmSchema,
  boostPrepareSchema,
} from "@/lib/marketplace/boost-request";

beforeEach(() => {
  resetMemoryStoreForTests();
  enableMemoryMode("unit-test");
  process.env.NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS =
    "0x6E481562F3ecC39405Dc8F8B17F6c754B36D0C14";
  process.env.NEXT_PUBLIC_PLATFORM_TREASURY_SOLANA =
    "96rDHepuNiz1eDDMikrkHqtM51Sw8s6miUxKhwtTn7YR";
});

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

  it("orders pay networks with the listing network first", () => {
    const nets = boostPayNetworks("base");
    expect(nets[0]).toBe("base");
    expect(nets).toContain("ethereum");
    expect(nets).toContain("solana");
    expect(nets).not.toContain("boing");
  });

  it("prepares a treasury native payment without activating the boost", async () => {
    const engine = getMemoryEngine();
    const listing = engine.state.listings.get("listing-fresh-1");
    expect(listing).toBeTruthy();
    if (!listing) return;
    listing.stage = "soft_launch";
    listing.featuredBoostedAt = null;

    const prepared = await prepareFeaturedBoost({
      actorId: listing.creatorId,
      listingId: listing.id,
      payNetwork: "ethereum",
      fromAddress: `0x${"a1".repeat(20)}`,
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.feeUsd).toBe(15);
    expect(prepared.settlement).toBe("pay_treasury_native");
    expect(prepared.settlementAddress.toLowerCase()).toBe(
      "0x6e481562f3ecc39405dc8f8b17f6c754b36d0c14",
    );
    expect(prepared.walletTx.to).toBe(prepared.settlementAddress);
    expect(prepared.walletTx.chain).toBe("evm");
    expect(prepared.quote.amountUsd).toBe(15);
    expect(engine.state.listings.get(listing.id)?.featuredBoostedAt).toBeNull();
  });

  it("activates the boost only after confirm with a tx hash", async () => {
    const engine = getMemoryEngine();
    const listing = engine.state.listings.get("listing-fresh-1");
    expect(listing).toBeTruthy();
    if (!listing) return;
    listing.stage = "soft_launch";
    listing.featuredBoostedAt = null;

    const denied = await confirmFeaturedBoost({
      actorId: "someone-else",
      listingId: listing.id,
      payNetwork: "ethereum",
      txHash: `0x${"ab".repeat(32)}`,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error).toBe("forbidden");

    const confirmed = await confirmFeaturedBoost({
      actorId: listing.creatorId,
      listingId: listing.id,
      payNetwork: "ethereum",
      txHash: `0x${"cd".repeat(32)}`,
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.settlement).toBe("paid");
    expect(confirmed.paymentTxHash).toMatch(/^0xcd/);
    expect(confirmed.listing.featuredBoostedAt).toBeTypeOf("number");
    expect(engine.state.listings.get(listing.id)?.featuredBoostedAt).not.toBeNull();

    const again = await confirmFeaturedBoost({
      actorId: listing.creatorId,
      listingId: listing.id,
      payNetwork: "ethereum",
      txHash: `0x${"ef".repeat(32)}`,
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe("already_boosted");
  });

  it("rejects confirm without a usable tx hash", async () => {
    const engine = getMemoryEngine();
    const listing = engine.state.listings.get("listing-fresh-1");
    expect(listing).toBeTruthy();
    if (!listing) return;
    listing.stage = "soft_launch";
    listing.featuredBoostedAt = null;

    const bad = await confirmFeaturedBoost({
      actorId: listing.creatorId,
      listingId: listing.id,
      payNetwork: "ethereum",
      txHash: "0xshort",
    });
    // length 7 after trim of "0xshort" is 7 < 8
    expect(bad.ok).toBe(false);
  });
});

describe("boost request schemas", () => {
  it("requires payNetwork and fromAddress to prepare", () => {
    expect(boostPrepareSchema.safeParse({}).success).toBe(false);
    expect(
      boostPrepareSchema.safeParse({
        payNetwork: "ethereum",
        fromAddress: `0x${"11".repeat(20)}`,
      }).success,
    ).toBe(true);
  });

  it("requires txHash on confirm", () => {
    expect(
      boostConfirmSchema.safeParse({
        payNetwork: "base",
        txHash: `0x${"22".repeat(32)}`,
      }).success,
    ).toBe(true);
    expect(
      boostConfirmSchema.safeParse({ payNetwork: "base", txHash: "0xabc" })
        .success,
    ).toBe(false);
  });
});
