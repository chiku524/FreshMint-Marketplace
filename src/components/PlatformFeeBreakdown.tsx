"use client";

import {
  PLATFORM_FEE_PERCENT,
  splitSaleProceeds,
} from "@/lib/fees/platform";
import { previewResaleFees } from "@/lib/marketplace/resale";

/**
 * Clear listed-price / treasury / seller-net breakdown for checkout & create.
 * Secondary listings also show creator royalty (schema bps / default 5%).
 */
export function PlatformFeeBreakdown({
  priceUsd,
  compact = false,
  isSecondary = false,
  creatorRoyaltyBps,
}: {
  priceUsd: number | null | undefined;
  compact?: boolean;
  isSecondary?: boolean;
  creatorRoyaltyBps?: number | null;
}) {
  if (priceUsd == null || !(priceUsd > 0)) {
    return (
      <p
        style={{
          margin: compact ? 0 : "0 0 0.65rem",
          color: "var(--ink-muted)",
          fontSize: "0.8rem",
          lineHeight: 1.45,
        }}
      >
        {PLATFORM_FEE_PERCENT.total}% treasury · seller keeps{" "}
        {PLATFORM_FEE_PERCENT.sellerNet}%
        {isSecondary ? " · plus creator royalty on resale" : ""}
      </p>
    );
  }

  if (isSecondary) {
    const fees = previewResaleFees({
      amountUsd: priceUsd,
      creatorRoyaltyBps,
    });
    return (
      <div
        style={{
          margin: compact ? 0 : "0 0 0.65rem",
          padding: compact ? 0 : "0.55rem 0.65rem",
          border: compact ? "none" : "1px solid var(--line)",
          background: compact ? "transparent" : "var(--panel)",
          fontSize: "0.8rem",
          lineHeight: 1.5,
          color: "var(--ink-muted)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <span>Listed price (buyer pays)</span>
          <strong style={{ color: "var(--ink)" }}>
            ${fees.amountUsd.toFixed(2)}
          </strong>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.75rem",
            marginTop: "0.2rem",
          }}
        >
          <span>Platform treasury ({PLATFORM_FEE_PERCENT.total}%)</span>
          <span>${fees.platformFeeUsd.toFixed(2)}</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.75rem",
            marginTop: "0.2rem",
          }}
        >
          <span>
            Creator royalty ({(fees.creatorRoyaltyBps / 100).toFixed(1)}%)
          </span>
          <span>${fees.creatorRoyaltyUsd.toFixed(2)}</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.75rem",
            marginTop: "0.2rem",
          }}
        >
          <span>Seller receives</span>
          <strong style={{ color: "var(--ink)" }}>
            ${fees.sellerNetUsd.toFixed(2)}
          </strong>
        </div>
      </div>
    );
  }

  const split = splitSaleProceeds(priceUsd);
  if (compact) {
    return (
      <p
        style={{
          margin: 0,
          color: "var(--ink-muted)",
          fontSize: "0.8rem",
          lineHeight: 1.45,
        }}
      >
        You&apos;ll net ~{PLATFORM_FEE_PERCENT.sellerNet}% after{" "}
        {PLATFORM_FEE_PERCENT.total}% treasury (≈ $
        {split.sellerNetUsd.toFixed(2)})
      </p>
    );
  }

  return (
    <div
      style={{
        margin: "0 0 0.65rem",
        padding: "0.55rem 0.65rem",
        border: "1px solid var(--line)",
        background: "var(--panel)",
        fontSize: "0.8rem",
        lineHeight: 1.5,
        color: "var(--ink-muted)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "0.75rem",
        }}
      >
        <span>Listed price (buyer pays)</span>
        <strong style={{ color: "var(--ink)" }}>
          ${split.amountUsd.toFixed(2)}
        </strong>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "0.75rem",
          marginTop: "0.2rem",
        }}
      >
        <span>Platform treasury ({PLATFORM_FEE_PERCENT.total}%)</span>
        <span>${split.feeTreasuryUsd.toFixed(2)}</span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "0.75rem",
          marginTop: "0.2rem",
        }}
      >
        <span>Seller receives ({PLATFORM_FEE_PERCENT.sellerNet}%)</span>
        <strong style={{ color: "var(--ink)" }}>
          ${split.sellerNetUsd.toFixed(2)}
        </strong>
      </div>
    </div>
  );
}
