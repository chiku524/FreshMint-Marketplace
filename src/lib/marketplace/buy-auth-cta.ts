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
  | "resume"
  | "busy";

/**
 * Single primary buy button states:
 * Checking sign-in → Sign in → Continue → Connect wallet → Bridge & pay / Pay / Resume.
 */
export function resolveBuyPrimaryCta(input: {
  sessionUserId: string | null | undefined;
  confirmOpen: boolean;
  paymentAddress: string | null;
  crossChain: boolean;
  buying: boolean;
  /** Pending purchase that can be resumed (payment already prepared). */
  canResume?: boolean;
  busyLabel?: string;
}): { kind: BuyPrimaryKind; label: string } {
  const auth = resolveBuyAuthCta(input.sessionUserId);
  if (auth === "checking") {
    return { kind: "checking", label: "Checking sign-in…" };
  }
  if (input.buying) {
    return {
      kind: "busy",
      label:
        input.busyLabel ??
        (input.crossChain ? "Bridging & paying…" : "Paying…"),
    };
  }
  if (auth === "sign_in") {
    return { kind: "sign_in", label: "Sign in to continue" };
  }
  if (input.canResume) {
    return { kind: "resume", label: "Resume payment" };
  }
  if (!input.confirmOpen) {
    return { kind: "continue", label: "Continue" };
  }
  if (!input.paymentAddress) {
    return { kind: "connect_wallet", label: "Connect wallet" };
  }
  if (input.crossChain) {
    return { kind: "bridge_pay", label: "Bridge & pay" };
  }
  return { kind: "pay", label: "Pay now" };
}

/** Map Relay / purchase API errors to short buyer-facing copy. */
export function humanizeCheckoutError(raw: string | null | undefined): string {
  const msg = (raw ?? "").trim();
  if (!msg) return "Checkout failed — try again";
  const lower = msg.toLowerCase();
  if (lower.includes("unauthorized") || lower === "sign_in") {
    return "Sign in to continue checkout";
  }
  if (lower.includes("wallet") && lower.includes("reject")) {
    return "Wallet request rejected";
  }
  if (lower.includes("insufficient") || lower.includes("balance")) {
    return "Insufficient balance for this payment";
  }
  if (lower.includes("relay") || lower.includes("bridge")) {
    return "Bridge quote failed — try another pay network or retry";
  }
  if (lower.includes("quote")) {
    return "Could not refresh the live quote — retry in a moment";
  }
  if (lower.includes("timeout") || lower.includes("network")) {
    return "Network timeout — check connection and retry";
  }
  if (lower.includes("already") && lower.includes("sold")) {
    return "This work is no longer available";
  }
  if (lower.includes("expired")) {
    return "Payment window expired";
  }
  // Keep short API codes readable
  if (msg.length <= 48 && !msg.includes(" ")) {
    return msg.replaceAll("_", " ");
  }
  return msg.length > 120 ? `${msg.slice(0, 117)}…` : msg;
}
