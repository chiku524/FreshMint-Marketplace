import { describe, expect, it } from "vitest";
import { z } from "zod";
import { apiError, invalidBody, readJsonBody } from "../json";

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

describe("api error helpers", () => {
  it("apiError uses the shared { error } shape", async () => {
    const res = apiError("not_found", 404, { id: "x" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found", id: "x" });
  });

  it("invalidBody lists field issues", async () => {
    const parsed = z.object({ amountUsd: z.number().positive() }).safeParse({ amountUsd: -1 });
    expect(parsed.success).toBe(false);
    const res = invalidBody(parsed.error);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
    expect(body.issues[0].path).toBe("amountUsd");
  });

  it("invalidBody without an error omits issues", async () => {
    expect(await invalidBody().json()).toEqual({ error: "invalid_body" });
  });
});
