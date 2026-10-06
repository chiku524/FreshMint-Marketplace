import { describe, expect, it } from "vitest";
import { formatBoingMintUserMessage } from "@/lib/onchain/boing-messages";

describe("formatBoingMintUserMessage", () => {
  it("humanizes Account not found and collection/creator missing codes", () => {
    expect(formatBoingMintUserMessage("Account not found")).toMatch(
      /contract was not found/i,
    );
    expect(
      formatBoingMintUserMessage("boing_collection_account_missing"),
    ).toMatch(/contract was not found/i);
    expect(
      formatBoingMintUserMessage("boing_creator_account_missing"),
    ).toMatch(/wallet account not found/i);
  });

  it("humanizes boing_account_probe_unknown", () => {
    expect(formatBoingMintUserMessage("boing_account_probe_unknown")).toMatch(
      /could not verify boing accounts/i,
    );
  });

  it("passes through unrelated errors", () => {
    expect(formatBoingMintUserMessage("listing_failed")).toBe("listing_failed");
  });
});
