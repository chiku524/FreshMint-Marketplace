/**
 * Paid Featured boost — promotional placement only.
 * Does not affect Rising scoring or Open Lane ranking.
 */
export const FEATURED_BOOST_USD = 15 as const;

export const FEATURED_BOOST_LABEL = "Featured boost";

export function describeFeaturedBoost(): string {
  return `$${FEATURED_BOOST_USD} promotional fee to treasury — Featured placement only; Rising stays a free fairness quota`;
}
