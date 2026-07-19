/**
 * FreshMint platform fees on primary sales.
 * Buyer pays the listed price; proceeds are split:
 *   1.5% → marketplace treasury
 *   1.0% → operator wallet
 *   97.5% → seller
 */
export const PLATFORM_FEE_BPS = {
  treasury: 150,
  operator: 100,
  total: 250,
} as const;

export const PLATFORM_FEE_PERCENT = {
  treasury: 1.5,
  operator: 1,
  total: 2.5,
  sellerNet: 97.5,
} as const;

export type SaleFeeSplit = {
  amountUsd: number;
  feeTreasuryUsd: number;
  feeOperatorUsd: number;
  feeTotalUsd: number;
  sellerNetUsd: number;
  treasuryBps: number;
  operatorBps: number;
  totalBps: number;
};

function roundUsd(n: number): number {
  return Math.round(n * 100) / 100;
}

export function splitSaleProceeds(amountUsd: number): SaleFeeSplit {
  const amount = Math.max(0, amountUsd);
  const feeTreasuryUsd = roundUsd((amount * PLATFORM_FEE_BPS.treasury) / 10_000);
  const feeOperatorUsd = roundUsd((amount * PLATFORM_FEE_BPS.operator) / 10_000);
  const feeTotalUsd = roundUsd(feeTreasuryUsd + feeOperatorUsd);
  const sellerNetUsd = roundUsd(amount - feeTotalUsd);
  return {
    amountUsd: amount,
    feeTreasuryUsd,
    feeOperatorUsd,
    feeTotalUsd,
    sellerNetUsd,
    treasuryBps: PLATFORM_FEE_BPS.treasury,
    operatorBps: PLATFORM_FEE_BPS.operator,
    totalBps: PLATFORM_FEE_BPS.total,
  };
}

export function platformFeeRecipients(): {
  treasury: string | null;
  operator: string | null;
  treasurySolana: string | null;
  operatorSolana: string | null;
} {
  const treasury =
    process.env.NEXT_PUBLIC_PLATFORM_TREASURY_ADDRESS?.trim() || null;
  const operator =
    process.env.NEXT_PUBLIC_PLATFORM_OPERATOR_ADDRESS?.trim() || null;
  const treasurySolana =
    process.env.NEXT_PUBLIC_PLATFORM_TREASURY_SOLANA?.trim() || null;
  const operatorSolana =
    process.env.NEXT_PUBLIC_PLATFORM_OPERATOR_SOLANA?.trim() || null;
  return { treasury, operator, treasurySolana, operatorSolana };
}

export function describePlatformFee(amountUsd: number | null | undefined): string {
  if (amountUsd == null || !(amountUsd > 0)) {
    return `${PLATFORM_FEE_PERCENT.total}% platform fee (${PLATFORM_FEE_PERCENT.treasury}% treasury · ${PLATFORM_FEE_PERCENT.operator}% operator)`;
  }
  const split = splitSaleProceeds(amountUsd);
  return `${PLATFORM_FEE_PERCENT.total}% fee · seller nets $${split.sellerNetUsd.toFixed(2)}`;
}
