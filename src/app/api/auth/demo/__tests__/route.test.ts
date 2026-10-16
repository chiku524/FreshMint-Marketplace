import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const state = vi.hoisted(() => ({
  mode: "prisma" as "prisma" | "memory",
  memory: false,
  creators: new Map<string, { id: string; displayName: string; wallets: unknown[]; curatorScore: number }>(),
  findUnique: vi.fn(),
  login: vi.fn(),
}));

vi.mock("@/lib/db-ready", () => ({
  ensureDatabaseReady: async () => state.mode,
}));
vi.mock("@/lib/data/memory-store", () => ({
  isMemoryMode: () => state.memory,
  getMemoryState: () => ({ creators: state.creators }),
}));
vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: state.findUnique } },
}));
vi.mock("@/lib/auth/session", () => ({
  completeLoginOrChallenge: state.login,
  getSessionUser: async () => null,
  jsonWithSessionCookie: (body: unknown) => NextResponse.json(body),
}));

import { POST } from "../route";

function req(userId: string) {
  return new NextRequest("http://localhost/api/auth/demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
}

const realUser = {
  id: "real-user-1",
  displayName: "Real Person",
  wallets: [],
  curatorScore: 0,
  totpEnabled: false,
};

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("ALLOW_DEMO_AUTH", "");
  state.mode = "prisma";
  state.memory = false;
  state.creators.clear();
  state.findUnique.mockReset().mockResolvedValue(realUser);
  state.login
    .mockReset()
    .mockResolvedValue({ ok: true, requires2fa: false, jwt: "jwt", expiresAt: new Date() });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/auth/demo", () => {
  it("rejects real database accounts without ALLOW_DEMO_AUTH", async () => {
    const res = await POST(req("real-user-1"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "disabled" });
    expect(state.findUnique).not.toHaveBeenCalled();
    expect(state.login).not.toHaveBeenCalled();
  });

  it("rejects even unknown ids before any lookup (no account probing)", async () => {
    const res = await POST(req("does-not-exist"));
    expect(res.status).toBe(403);
    expect(state.findUnique).not.toHaveBeenCalled();
  });

  it("treats values other than the exact string 'true' as disabled", async () => {
    vi.stubEnv("ALLOW_DEMO_AUTH", "1");
    const res = await POST(req("real-user-1"));
    expect(res.status).toBe(403);
    expect(state.login).not.toHaveBeenCalled();
  });

  it("allows database demo login only with ALLOW_DEMO_AUTH=true", async () => {
    vi.stubEnv("ALLOW_DEMO_AUTH", "true");
    const res = await POST(req("real-user-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, mode: "prisma", user: { id: "real-user-1" } });
    expect(state.login).toHaveBeenCalledWith("real-user-1");
  });

  it("is fully disabled in production off Vercel without the flag", async () => {
    vi.stubEnv("VERCEL", "");
    const res = await POST(req("real-user-1"));
    expect(res.status).toBe(403);
  });

  it("still signs into seeded personas in sample-data (memory) mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "");
    state.mode = "memory";
    state.memory = true;
    state.creators.set("artist-nova", {
      id: "artist-nova",
      displayName: "Nova Ink",
      wallets: [],
      curatorScore: 40,
    });
    const res = await POST(req("artist-nova"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, mode: "memory", user: { id: "artist-nova" } });
    expect(state.findUnique).not.toHaveBeenCalled();
  });

  it("returns not_found for unknown personas in sample-data mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    state.mode = "memory";
    state.memory = true;
    const res = await POST(req("nobody"));
    expect(res.status).toBe(404);
  });
});
