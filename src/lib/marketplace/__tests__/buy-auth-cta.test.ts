import { describe, expect, it } from "vitest";
import { resolveBuyAuthCta } from "@/lib/marketplace/buy-auth-cta";

describe("resolveBuyAuthCta", () => {
  it("shows checking while session is loading", () => {
    expect(resolveBuyAuthCta(undefined)).toBe("checking");
  });

  it("prompts sign-in when session is null", () => {
    expect(resolveBuyAuthCta(null)).toBe("sign_in");
  });

  it("is ready when a user id is known", () => {
    expect(resolveBuyAuthCta("user-1")).toBe("ready");
  });
});
