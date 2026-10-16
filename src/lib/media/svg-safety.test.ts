import { describe, expect, it } from "vitest";
import { isSafeSvg } from "./upload";

describe("isSafeSvg", () => {
  it("accepts plain artwork", () => {
    expect(isSafeSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="red"/><style>.a{fill:blue}</style></svg>')).toBe(true);
  });
  it.each([
    '<svg><script>alert(1)</script></svg>',
    '<svg onload="alert(1)"></svg>',
    '<svg><a href="javascript:alert(1)"><text>x</text></a></svg>',
    '<svg><foreignObject><div/></foreignObject></svg>',
    '<!DOCTYPE svg [<!ENTITY x "y">]><svg/>',
  ])("rejects %s", (svg) => {
    expect(isSafeSvg(svg)).toBe(false);
  });
});