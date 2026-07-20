import { describe, expect, it } from "vitest";
import { isoWeekKey, weekLabelFromKey } from "@/lib/marketplace/featured-week";

describe("featured of the week helpers", () => {
  it("formats a stable ISO week key", () => {
    const key = isoWeekKey(Date.UTC(2026, 6, 20)); // Jul 20 2026
    expect(key).toMatch(/^\d{4}-W\d{2}$/);
    expect(weekLabelFromKey(key)).toMatch(/^Week \d+, \d{4}$/);
  });

  it("keeps the same week key across the same UTC week", () => {
    const mon = isoWeekKey(Date.UTC(2026, 6, 20));
    const sun = isoWeekKey(Date.UTC(2026, 6, 26));
    expect(mon).toBe(sun);
  });
});
