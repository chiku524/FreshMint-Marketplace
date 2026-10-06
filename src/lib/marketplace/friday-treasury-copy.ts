/**
 * Collector-facing copy for Friday treasury buys.
 * Same restrained product voice as /docs fees + Open Lane — not a campaign.
 */
export const TREASURY_FRIDAY_COPY = {
  home: "Every Friday, if last week’s treasury fees cover it, FreshMint buys a live work from Open Lane.",
  open: "The marketplace treasury looks here on Fridays and buys a listed work when last week’s fees cover it.",
  listing:
    "Listed works on Open Lane can be bought by the platform treasury on Fridays, using last week’s treasury fees.",
  collection:
    "Works listed from this collection can be bought by the platform treasury on Fridays, using last week’s treasury fees.",
  docs:
    "Each Friday the treasury spends up to that week’s 0.5% sale fees (plus Featured boosts) on one live Open Lane work — skipped when that profit is zero or native balances cannot cover the price.",
} as const;
