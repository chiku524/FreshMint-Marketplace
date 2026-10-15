import { describe, expect, it } from "vitest";
import { migratePolicy, nonRetryableCode } from "../../../../scripts/migrate-policy.mjs";

const DB = { DATABASE_URL: "postgres://example/db" };

describe("migratePolicy", () => {
  it("skips without DATABASE_URL", () => {
    expect(migratePolicy({ VERCEL_ENV: "production" }).run).toBe(false);
  });
  it("skips Vercel preview unless opted in", () => {
    expect(migratePolicy({ ...DB, VERCEL_ENV: "preview" }).run).toBe(false);
    expect(migratePolicy({ ...DB, VERCEL_ENV: "preview", MIGRATE_ON_PREVIEW: "1" }).run).toBe(true);
  });
  it("always runs on production and locally unless explicitly skipped", () => {
    expect(migratePolicy({ ...DB, VERCEL_ENV: "production" }).run).toBe(true);
    expect(migratePolicy({ ...DB }).run).toBe(true);
    expect(migratePolicy({ ...DB, VERCEL_ENV: "production", SKIP_DB_MIGRATE: "true" }).run).toBe(false);
  });
});

describe("nonRetryableCode", () => {
  it("detects unreachable-database errors", () => {
    expect(nonRetryableCode("Error: P1001: Can't reach database server")).toBe("P1001");
    expect(nonRetryableCode("too many connections for role")).toBeNull();
  });
});