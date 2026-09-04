import { beforeEach, describe, expect, it } from "vitest";
import {
  AccountError,
  getMemoryAccount,
  loginWithPassword,
  registerWithPassword,
  resetMemoryAccountsForTests,
  upsertUserFromGoogle,
} from "@/lib/auth/account";
import { hashPassword, normalizeEmail, verifyPassword } from "@/lib/auth/password";
import { safeNextPath } from "@/lib/auth/paths";
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
