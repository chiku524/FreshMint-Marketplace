import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AccountError,
  getMemoryAccount,
  loginWithPassword,
  registerWithPassword,
  resetMemoryAccountsForTests,
  upsertUserFromGoogle,
} from "@/lib/auth/account";
import { hashPassword, normalizeEmail, verifyPassword } from "@/lib/auth/password";
import {
  authUsesMemoryStore,
  clearSessionCookie,
  jsonWithSessionCookie,
  readNamedCookie,
  SESSION_COOKIE,
} from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { absoluteAppUrl, appBaseUrl, safeNextPath } from "@/lib/auth/paths";
import {
  enableMemoryMode,
  getMemoryState,
  resetMemoryStoreForTests,
} from "@/lib/data/memory-store";

beforeEach(() => {
  process.env.AUTH_SECRET = "test-auth-secret-32chars-minimum!!";
  resetMemoryStoreForTests();
  resetMemoryAccountsForTests();
  enableMemoryMode("unit-test");
});

describe("password helpers", () => {
  it("hashes and verifies", () => {
    const hash = hashPassword("correct-horse-battery");
    expect(hash).toContain(".");
    expect(verifyPassword("correct-horse-battery", hash)).toBe(true);
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("normalizes email", () => {
    expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com");
  });
});

describe("safeNextPath", () => {
  it("rejects open redirects", () => {
    expect(safeNextPath("/me/security")).toBe("/me/security");
    expect(safeNextPath("https://evil.example")).toBe("/me");
    expect(safeNextPath("//evil.example")).toBe("/me");
    expect(safeNextPath(null)).toBe("/me");
  });
});

describe("appBaseUrl", () => {
  const prev = {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("prefers the Vercel production host over localhost request urls", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "fresh-mint-marketplace.vercel.app";
    expect(appBaseUrl("http://localhost:3000/api/auth/google")).toBe(
      "https://fresh-mint-marketplace.vercel.app",
    );
    expect(
      absoluteAppUrl("/me", "http://localhost:3000/api/auth/google/callback").href,
    ).toBe("https://fresh-mint-marketplace.vercel.app/me");
  });
});

describe("readNamedCookie", () => {
  it("reads a session cookie from a raw header", () => {
    expect(
      readNamedCookie(
        "theme=dark; freshmint_session=abc.def.ghi; other=1",
        SESSION_COOKIE,
      ),
    ).toBe("abc.def.ghi");
    expect(readNamedCookie(null, SESSION_COOKIE)).toBeUndefined();
  });
});

describe("jsonWithSessionCookie", () => {
  it("clears the session cookie on a response", () => {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, "stale.demo.jwt");
    clearSessionCookie(res);
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBe("");
  });

  it("sets the session cookie on the JSON response", () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const res = jsonWithSessionCookie(
      { ok: true },
      { jwt: "test.jwt.token", expiresAt },
    );
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBe("test.jwt.token");
  });
});

describe("authUsesMemoryStore", () => {
  const prev = process.env.DATABASE_URL;

  afterEach(() => {
    if (prev === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prev;
  });

  it("uses durable auth when Postgres is configured", () => {
    process.env.DATABASE_URL = "postgresql://freshmint:freshmint@127.0.0.1:5433/freshmint";
    expect(authUsesMemoryStore()).toBe(false);
  });

  it("uses memory auth only without Postgres", () => {
    delete process.env.DATABASE_URL;
    expect(authUsesMemoryStore()).toBe(true);
  });
});

describe("account register/login (memory)", () => {
  it("registers then logs in", async () => {
    const created = await registerWithPassword({
      displayName: "Ada Ink",
      email: "ada@example.com",
      password: "longenough",
    });
    expect(created.userId).toMatch(/^user-/);
    expect(getMemoryState().creators.get(created.userId)?.displayName).toBe("Ada Ink");
    expect(getMemoryAccount(created.userId)?.email).toBe("ada@example.com");

    const loggedIn = await loginWithPassword({
      email: "ADA@example.com",
      password: "longenough",
    });
    expect(loggedIn.userId).toBe(created.userId);
  });

  it("rejects duplicate emails and bad passwords", async () => {
    await registerWithPassword({
      displayName: "Ada",
      email: "ada@example.com",
      password: "longenough",
    });
    await expect(
      registerWithPassword({
        displayName: "Other",
        email: "ada@example.com",
        password: "different1",
      }),
    ).rejects.toBeInstanceOf(AccountError);

    await expect(
      loginWithPassword({ email: "ada@example.com", password: "nope-nope" }),
    ).rejects.toMatchObject({ message: "invalid_credentials" });
  });

  it("upserts Google users and links by email", async () => {
    const first = await upsertUserFromGoogle({
      id: "gid-1",
      email: "ada@example.com",
      verified_email: true,
      name: "Ada G",
      picture: "https://example.com/a.png",
    });
    const again = await upsertUserFromGoogle({
      id: "gid-1",
      email: "ada@example.com",
      verified_email: true,
      name: "Ada G",
    });
    expect(again.userId).toBe(first.userId);

    const passwordUser = await registerWithPassword({
      displayName: "Mail First",
      email: "mail@example.com",
      password: "longenough",
    });
    const linked = await upsertUserFromGoogle({
      id: "gid-2",
      email: "mail@example.com",
      verified_email: true,
    });
    expect(linked.userId).toBe(passwordUser.userId);
    expect(getMemoryAccount(passwordUser.userId)?.googleId).toBe("gid-2");
  });
});
