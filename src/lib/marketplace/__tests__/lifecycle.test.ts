import { describe, expect, it } from "vitest";
import {
  PENDING_PAYMENT_TTL_MS,
  canUserStageListing,
  creatorLifecycleHint,
  purchaseReservesSupply,
  stageLabel,
} from "@/lib/marketplace/lifecycle";

describe("purchaseReservesSupply", () => {
  const now = 1_700_000_000_000;

  it("treats missing status as a completed sale", () => {
    expect(purchaseReservesSupply({ soldAt: now }, now)).toBe(true);
  });

  it("holds supply for pending_transfer and completed", () => {
    expect(
      purchaseReservesSupply({ status: "pending_transfer", soldAt: now }, now),
    ).toBe(true);
    expect(
      purchaseReservesSupply({ status: "completed", soldAt: now }, now),
    ).toBe(true);
  });

  it("holds unpaid checkouts only within the TTL", () => {
    expect(
      purchaseReservesSupply(
        { status: "pending_payment", soldAt: now - 60_000 },
        now,
      ),
    ).toBe(true);
    expect(
      purchaseReservesSupply(
        {
          status: "pending_payment",
          soldAt: now - PENDING_PAYMENT_TTL_MS - 1,
        },
        now,
      ),
    ).toBe(false);
  });

  it("releases failed purchases", () => {
    expect(purchaseReservesSupply({ status: "failed", soldAt: now }, now)).toBe(
      false,
    );
  });
});

describe("stage helpers", () => {
  it("labels stages for collectors", () => {
    expect(stageLabel("soft_launch")).toBe("Open Lane");
    expect(stageLabel("rising_eligible")).toBe("Rising");
  });

  it("lets owners and editors stage, not arbitrary verified creators", () => {
    const listing = { creatorId: "artist-1" };
    expect(canUserStageListing({ id: "artist-1", role: "member" }, listing)).toBe(
      true,
    );
    expect(
      canUserStageListing({ id: "editor-1", role: "editor" }, listing),
    ).toBe(true);
    expect(
      canUserStageListing({ id: "other", role: "member" }, listing),
    ).toBe(false);
  });

  it("hints minted drafts toward soft-launch", () => {
    expect(
      creatorLifecycleHint(
        {
          stage: "draft",
          tokenId: "1",
          contractAddress: "0xabc",
          mintTxHash: "0xmint",
        },
        false,
      ),
    ).toMatch(/soft-launch/i);
  });

  it("tells artists their first work auto-enters Rising", () => {
    expect(
      creatorLifecycleHint(
        {
          stage: "soft_launch",
          tokenId: "1",
          contractAddress: "0xabc",
          mintTxHash: "0xmint",
        },
        false,
      ),
    ).toMatch(/first work auto-enters Rising/i);
  });

  it("names the remaining new-wallet wait", () => {
    expect(
      creatorLifecycleHint(
        {
          stage: "soft_launch",
          tokenId: "1",
          contractAddress: "0xabc",
          mintTxHash: "0xmint",
        },
        false,
        {
          ready: false,
          errors: ["new_wallet_cooldown"],
          firstRisingLook: false,
          cooldownRemainingMs: 18 * 60 * 60 * 1000,
        },
      ),
    ).toMatch(/about 18h/i);
  });
});
