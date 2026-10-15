/** Shared mint-sprig geometry (64×64). One ovate blade, mirrored by rotation. */

export const MINT_PIVOT = { x: 32, y: 42 } as const;
export const MINT_LEAF_ANGLE = 50;

/** Vertical stem into the leaf node. */
export const MINT_STEM = "M32 56C32.05 51 32.08 46.5 32 42";

/**
 * Canonical blade pointing up from the pivot.
 * Broad ovate belly, acute tip — rotated ±MINT_LEAF_ANGLE for the pair.
 */
export const MINT_LEAF_UP =
  "M32 42C25.6 40.6 21.6 29.4 26.2 18.2C28.8 13.4 31.15 11.5 32 11.3C32.85 11.5 35.2 13.4 37.8 18.2C42.4 29.4 38.4 40.6 32 42Z";

export const MINT_VEIN_UP = "M32 40.8C32 33.5 32 22.5 32 14.8";

export const MINT_LATERAL_LEFT =
  "M32 33.5C29.2 32.2 27.4 31.2 26.2 30.4M32 25.5C29.6 24.4 28.2 23.5 27.2 22.8";
export const MINT_LATERAL_RIGHT =
  "M32 33.5C34.8 32.2 36.6 31.2 37.8 30.4M32 25.5C34.4 24.4 35.8 23.5 36.8 22.8";

export const MINT_JUNCTION = {
  cx: MINT_PIVOT.x,
  cy: MINT_PIVOT.y + 0.15,
  r: 1.85,
} as const;

export function mintLeafTransform(angle: number, scale = 1): string {
  const { x, y } = MINT_PIVOT;
  return `translate(${x} ${y}) rotate(${angle}) scale(${scale}) translate(${-x} ${-y})`;
}
