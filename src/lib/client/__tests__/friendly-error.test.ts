import { describe, expect, it } from "vitest";
import { friendlyError, looksLikeErrorCode } from "@/lib/client/friendly-error";

describe("friendlyError", () => {
  it("never shows raw codes", () => {
    expect(friendlyError("publish_failed")).toBe("Couldn't publish. Please try again.");
    expect(friendlyError("some_weird_code")).toBe("Something went wrong. Please try again.");
    expect(friendlyError("unauthorized")).toMatch(/sign in/i);
  });
  it("keeps human messages", () => {
    expect(friendlyError("Wallet request rejected")).toBe("Wallet request rejected");
  });
  it("maps network failures", () => {
    expect(friendlyError(new TypeError("Failed to fetch"))).toMatch(/connection/);
  });
  it("uses the provided fallback and handles empties", () => {
    expect(friendlyError("", "Nope")).toBe("Nope");
    expect(friendlyError("xyz_unknown", "Nope")).toBe("Nope");
  });
  it("detects codes", () => {
    expect(looksLikeErrorCode("boing_token_not_on_chain")).toBe(true);
    expect(looksLikeErrorCode("Not on chain yet")).toBe(false);
  });
});
