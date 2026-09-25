import { describe, expect, it } from "vitest";
import {
  humanizeCheckoutError,
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

  it("asks signed-out buyers to sign in", () => {
    expect(resolveBuyPrimaryCta({ ...base, sessionUserId: null })).toEqual({
      kind: "sign_in",
      label: "Sign in to continue",
    });
  });

  it("advances connect → bridge/pay and supports resume", () => {
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
    ).toEqual({ kind: "pay", label: "Pay now" });

    expect(
      resolveBuyPrimaryCta({
        ...base,
        sessionUserId: "u1",
        confirmOpen: true,
        paymentAddress: "0xabc",
        crossChain: true,
      }),
    ).toEqual({ kind: "bridge_pay", label: "Bridge & pay" });

    expect(
      resolveBuyPrimaryCta({
        ...base,
        sessionUserId: "u1",
        canResume: true,
      }),
    ).toEqual({ kind: "resume", label: "Resume payment" });
  });

  it("disables double-submit with busy labels", () => {
    expect(
      resolveBuyPrimaryCta({
        ...base,
        sessionUserId: "u1",
        confirmOpen: true,
        paymentAddress: "0xabc",
        crossChain: true,
        buying: true,
      }).label,
    ).toBe("Bridging & paying…");
  });
});

describe("humanizeCheckoutError", () => {
  it("maps common Relay/wallet failures", () => {
    expect(humanizeCheckoutError("relay_quote_failed")).toMatch(/bridge/i);
    expect(humanizeCheckoutError("insufficient funds")).toMatch(/balance/i);
    expect(humanizeCheckoutError("")).toMatch(/try again/i);
  });
});
