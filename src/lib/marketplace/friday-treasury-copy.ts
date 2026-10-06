/**
 * Collector-facing copy for Friday treasury buys.
 * Same restrained product voice as /docs fees + Open Lane — not a campaign.
 */
export const TREASURY_FRIDAY_COPY = {
  home: "Every Friday, if the treasury has the funds, FreshMint buys a live work from Open Lane.",
  open: "The marketplace treasury looks here on Fridays and buys a listed work when it has the funds.",
  listing:
    "Listed works on Open Lane can be bought by the platform treasury on Fridays, if it has the funds.",
  collection:
    "Works listed from this collection can be bought by the platform treasury on Fridays, if it has the funds.",
  docs:
    "When native balances cover a listed price, the same treasury buys one live Open Lane work each Friday (USD cap; skipped if empty or nothing eligible).",
} as const;
