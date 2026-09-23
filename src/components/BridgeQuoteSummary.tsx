"use client";

/**
 * Shared Relay bridge quote strip for buy checkout and /bridge panel.
 * feeUsd is best-effort — missing fee still allows Bridge & buy with a warning.
 */
export function BridgeQuoteSummary({
  feeUsd,
  estimatedOutput,
  requestId,
  loading = false,
  needsWallet = false,
  onConnectWallet,
}: {
  feeUsd?: string | null;
  estimatedOutput?: string | null;
  requestId?: string | null;
  loading?: boolean;
  /** Cross-chain quote waiting on a connected payment wallet. */
  needsWallet?: boolean;
  onConnectWallet?: () => void;
}) {
  if (needsWallet) {
    return (
      <div
        style={{
          margin: "0 0 0.65rem",
          padding: "0.55rem 0.65rem",
          border: "1px solid var(--line)",
          background: "var(--panel)",
          fontSize: "0.8rem",
          lineHeight: 1.45,
          color: "var(--ink-muted)",
        }}
      >
        <p style={{ margin: "0 0 0.4rem" }}>
          Connect your payment wallet to load a live Relay bridge fee quote.
        </p>
        {onConnectWallet ? (
          <button
            type="button"
            className="badge"
            style={{ cursor: "pointer", background: "transparent" }}
            onClick={onConnectWallet}
          >
            Connect payment wallet
          </button>
        ) : null}
      </div>
    );
  }

  if (loading) {
    return (
      <p
        style={{
          margin: "0 0 0.65rem",
          color: "var(--ink-muted)",
          fontSize: "0.8rem",
        }}
      >
        Fetching Relay bridge fee…
      </p>
    );
  }

  const hasFee =
    feeUsd != null && String(feeUsd).trim() !== "" && Number(feeUsd) >= 0;

  return (
    <div
      style={{
        margin: "0 0 0.65rem",
        padding: "0.55rem 0.65rem",
        border: "1px solid var(--line)",
        background: "var(--panel)",
        fontSize: "0.8rem",
        lineHeight: 1.45,
        color: "var(--ink-muted)",
      }}
    >
      {estimatedOutput ? <div>Est. bridge output: {estimatedOutput}</div> : null}
      {hasFee ? (
        <div>
          Relay bridge fee ≈ ${String(feeUsd)}
        </div>
      ) : (
        <div style={{ color: "var(--accent-soft)" }}>
          Relay fee unavailable right now — you can still Bridge &amp; buy; the
          wallet quote may show network fees.
        </div>
      )}
      {requestId ? (
        <div style={{ wordBreak: "break-all", opacity: 0.75, marginTop: "0.2rem" }}>
          Request: {requestId}
        </div>
      ) : null}
    </div>
  );
}
