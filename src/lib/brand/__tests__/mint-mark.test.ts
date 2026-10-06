import { describe, expect, it } from "vitest";
import {
  MINT_JUNCTION,
  MINT_LEAF_ANGLE,
  MINT_LEAF_UP,
  MINT_PIVOT,
  MINT_STEM,
  mintLeafTransform,
} from "@/lib/brand/mint-mark";

describe("mint mark geometry", () => {
  it("keeps a closed ovate blade on a centered stem", () => {
    expect(MINT_STEM.startsWith("M32")).toBe(true);
    expect(MINT_LEAF_UP.endsWith("Z")).toBe(true);
    expect(MINT_JUNCTION.cx).toBe(MINT_PIVOT.x);
    expect(MINT_LEAF_ANGLE).toBeGreaterThanOrEqual(46);
    expect(MINT_LEAF_ANGLE).toBeLessThanOrEqual(56);
  });

  it("opens the pair from the leaf node", () => {
    expect(mintLeafTransform(MINT_LEAF_ANGLE)).toContain(`rotate(${MINT_LEAF_ANGLE})`);
    expect(mintLeafTransform(-MINT_LEAF_ANGLE, 1)).toContain(`translate(${MINT_PIVOT.x} ${MINT_PIVOT.y})`);
  });
});
