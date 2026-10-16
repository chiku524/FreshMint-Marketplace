import { afterEach, describe, expect, it, vi } from "vitest";
import { getDatabaseUrl, isPostgresConfigured } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("database URL precedence", () => {
  it("prefers the Neon STORAGE_DATABASE_URL over legacy DATABASE_URL", () => {
    vi.stubEnv("STORAGE_DATABASE_URL", "postgresql://u:p@neon.example/db");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@legacy.example/db");
    expect(getDatabaseUrl()).toBe("postgresql://u:p@neon.example/db");
  });

  it("falls back to DATABASE_URL when the Neon var is empty (e.g. a pulled Sensitive var)", () => {
    vi.stubEnv("STORAGE_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@legacy.example/db");
    expect(getDatabaseUrl()).toBe("postgresql://u:p@legacy.example/db");
  });

  it("returns null (memory sample catalog) when nothing is set", () => {
    vi.stubEnv("STORAGE_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "");
    expect(getDatabaseUrl()).toBeNull();
    expect(isPostgresConfigured()).toBe(false);
  });

  it("ignores legacy sqlite file URLs", () => {
    vi.stubEnv("STORAGE_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "file:./dev.db");
    expect(getDatabaseUrl()).toBeNull();
  });
});
