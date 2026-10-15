import { describe, expect, it } from "vitest";
import { createSingleFlight, isAbortError } from "../single-flight";

describe("createSingleFlight", () => {
  it("drops overlapping calls and allows the next after completion", async () => {
    const guard = createSingleFlight();
    let calls = 0;
    let release!: () => void;
    const slow = () =>
      new Promise<string>((resolve) => {
        calls++;
        release = () => resolve("done");
      });
    const first = guard(slow);
    const second = await guard(slow);
    expect(second).toBeUndefined();
    release();
    expect(await first).toBe("done");
    expect(calls).toBe(1);
    expect(await guard(async () => 2)).toBe(2);
  });

  it("releases after a rejection", async () => {
    const guard = createSingleFlight();
    await expect(guard(async () => { throw new Error("x"); })).rejects.toThrow("x");
    expect(await guard(async () => "ok")).toBe("ok");
  });
});

describe("isAbortError", () => {
  it("detects abort errors", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isAbortError({ name: "AbortError" })).toBe(true);
    expect(isAbortError(new Error("nope"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});
