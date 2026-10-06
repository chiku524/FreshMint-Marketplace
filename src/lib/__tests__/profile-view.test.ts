import { describe, expect, it } from "vitest";
import {
  parseProfileView,
  resolveProfileView,
} from "@/lib/profile-view";

describe("profile-view", () => {
  it("defaults unknown values to grid", () => {
    expect(parseProfileView(undefined)).toBe("grid");
    expect(parseProfileView(null)).toBe("grid");
    expect(parseProfileView("masonry")).toBe("grid");
  });

  it("accepts gallery, grid, and list", () => {
    expect(parseProfileView("gallery")).toBe("gallery");
    expect(parseProfileView("grid")).toBe("grid");
    expect(parseProfileView("list")).toBe("list");
  });

  it("lets the URL query override stored preference", () => {
    expect(resolveProfileView("list", "gallery")).toBe("list");
    expect(resolveProfileView(undefined, "gallery")).toBe("gallery");
    expect(resolveProfileView("nope", "list")).toBe("list");
    expect(resolveProfileView(null, null)).toBe("grid");
  });
});
