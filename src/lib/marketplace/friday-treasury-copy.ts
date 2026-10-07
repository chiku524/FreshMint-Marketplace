/**
 * Collector-facing copy for Friday treasury buys + raffle.
 * Same restrained product voice as /docs fees + Open Lane — not a campaign.
 */
export const TREASURY_FRIDAY_COPY = {
  home: "Every Friday, if last week’s treasury fees cover it, FreshMint buys a live Open Lane work and raffles it to active creators and collectors.",
  open: "The marketplace treasury looks here on Fridays, buys a listed work when last week’s fees cover it, and raffles that work to someone who minted, listed, bought, offered, or bid that week.",
  listing:
    "Listed works on Open Lane can be bought by the platform treasury on Fridays and raffled to active creators and collectors, using last week’s treasury fees.",
  collection:
    "Works listed from this collection can be bought by the platform treasury on Fridays and raffled to active users, using last week’s treasury fees.",
  docs:
    "Each Friday the treasury spends up to that week’s 0.5% sale fees (plus Featured boosts) on one live Open Lane work, then raffles it to an auto-entered active creator or collector — skipped when that profit is zero or native balances cannot cover the price.",
  studio:
    "Friday treasury raffle: active creators and collectors who mint, list, buy, offer, or bid during the week are auto-entered. Results post after the Friday fee-funded buy.",
  me: "Friday raffle status for the treasury Open Lane buy. Eligible from real activity that week; winners claim here if on-chain transfer is still pending.",
  eligibility:
    "Auto-entered when you mint, list, buy, offer, or bid during the week before Friday (UTC). Flagged accounts, empty wallets, and treasury addresses are excluded. The seller of that Friday’s bought work cannot win their own piece.",
} as const;
