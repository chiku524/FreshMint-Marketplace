/**
 * Buy CTA while FreshMint session is loading / known (session-first).
 * undefined = auth still loading; null = signed out; string = signed in.
 */
export function resolveBuyAuthCta(
  sessionUserId: string | null | undefined,
): "checking" | "sign_in" | "ready" {
  if (sessionUserId === undefined) return "checking";
  if (sessionUserId === null) return "sign_in";
  return "ready";
}

export type BuyPrimaryKind =
  | "checking"
  | "sign_in"
  | "continue"
  | "connect_wallet"
  | "pay"
  | "bridge_pay"
  | "busy";

/**
 * Single primary buy button: Continue → session → wallet → optional bridge → pay.
 */
export function resolveBuyPrimaryCta(input: {
  sessionUserId: string | null | undefined;
  confirmOpen: boolean;
  paymentAddress: string | null;
  crossChain: boolean;
  buying: boolean;
  busyLabel?: string;
}): { kind: BuyPrimaryKind; label: string } {
  const auth = resolveBuyAuthCta(input.sessionUserId);
  if (auth === "checking") {
    return { kind: "checking", label: "Checking sign-in…" };
  }
  if (input.buying) {
    return {
      kind: "busy",
      label: input.busyLabel ?? (input.crossChain ? "Paying…" : "Paying…"),
    };
  }
  if (auth === "sign_in") {
    return { kind: "sign_in", label: "Continue" };
  }
  if (!input.confirmOpen) {
    return { kind: "continue", label: "Continue" };
  }
  if (!input.paymentAddress) {
    return { kind: "connect_wallet", label: "Connect wallet" };
  }
  if (input.crossChain) {
    return { kind: "bridge_pay", label: "Pay" };
  }
  return { kind: "pay", label: "Pay" };
}
