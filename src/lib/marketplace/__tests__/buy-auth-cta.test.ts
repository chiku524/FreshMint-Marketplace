import { describe, expect, it } from "vitest";
import {
  resolveBuyAuthCta,
  resolveBuyPrimaryCta,
} from "@/lib/marketplace/buy-auth-cta";

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

describe("resolveBuyPrimaryCta", () => {
  const base = {
    confirmOpen: false,
    paymentAddress: null as string | null,
    crossChain: false,
    buying: false,
  };

  it("keeps Checking sign-in while auth loads", () => {
    expect(
      resolveBuyPrimaryCta({ ...base, sessionUserId: undefined }),
    ).toEqual({ kind: "checking", label: "Checking sign-in…" });
  });

  it("uses Continue for signed-out and signed-in closed checkout", () => {
    expect(resolveBuyPrimaryCta({ ...base, sessionUserId: null }).kind).toBe(
      "sign_in",
    );
    expect(resolveBuyPrimaryCta({ ...base, sessionUserId: null }).label).toBe(
      "Continue",
    );
    expect(
      resolveBuyPrimaryCta({ ...base, sessionUserId: "u1" }).kind,
    ).toBe("continue");
  });

  it("advances to connect wallet then pay", () => {
    expect(
      resolveBuyPrimaryCta({
        ...base,
        sessionUserId: "u1",
        confirmOpen: true,
        paymentAddress: null,
      }),
    ).toEqual({ kind: "connect_wallet", label: "Connect wallet" });

    expect(
      resolveBuyPrimaryCta({
        ...base,
        sessionUserId: "u1",
        confirmOpen: true,
        paymentAddress: "0xabc",
        crossChain: false,
      }),
    ).toEqual({ kind: "pay", label: "Pay" });

    expect(
      resolveBuyPrimaryCta({
        ...base,
        sessionUserId: "u1",
        confirmOpen: true,
        paymentAddress: "0xabc",
        crossChain: true,
      }),
    ).toEqual({ kind: "bridge_pay", label: "Pay" });
  });
});
