import { describe, expect, it } from "vitest";
import { readJsonBody } from "../json";

describe("readJsonBody", () => {
  it("returns parsed JSON", async () => {
    const req = new Request("http://x", { method: "POST", body: '{"a":1}' });
    expect(await readJsonBody(req)).toEqual({ a: 1 });
  });
  it("returns undefined for malformed or empty bodies", async () => {
    expect(
      await readJsonBody(new Request("http://x", { method: "POST", body: "{nope" })),
    ).toBeUndefined();
    expect(await readJsonBody(new Request("http://x", { method: "POST" }))).toBeUndefined();
  });
});
