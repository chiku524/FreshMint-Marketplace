import { describe, expect, it } from "vitest";
import { isTheme, resolveTheme, THEME_STORAGE_KEY } from "@/lib/theme";

describe("theme helpers", () => {
  it("recognizes light and dark only", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("system")).toBe(false);
    expect(isTheme(null)).toBe(false);
  });

  it("prefers stored theme over system", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("exposes a stable storage key", () => {
    expect(THEME_STORAGE_KEY).toBe("fm-theme");
  });
});
