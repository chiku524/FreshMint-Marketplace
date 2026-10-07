/**
 * Friday treasury raffle — marketing + slim claim-surface copy.
 * Awareness lives on the sitewide banner; /docs is not the primary channel.
 */
export const TREASURY_FRIDAY_COPY = {
  /** Sitewide marketing banner headline */
  bannerTitle: "Friday treasury raffle",
  /** Sitewide marketing banner supporting line */
  bannerLead:
    "Stay active and you’re auto-entered. When the treasury earns, one Open Lane work is awarded every Friday.",
  /** Banner CTA label */
  bannerCta: "See this week",
  /** Deep-link target for the banner (public treasury hub + raffle anchor) */
  bannerHref: "/treasury#friday-raffle",
  /** Slim status lead on /me claim UI — not an eligibility essay */
  me: "Your Friday raffle entry and any prize claims.",
  /** Kept for API/docs minimal stubs; not surface lecture copy */
  eligibility:
    "Auto-entered from mint, list, buy, offer, or bid activity in the week before Friday (UTC).",
} as const;
