import { describe, expect, it } from "vitest";
import {
  isPrismaPostgresUrl,
  preferPooledPrismaUrl,
} from "@/lib/prisma-adapter";

describe("prisma adapter helpers", () => {
  it("detects Prisma Postgres hosts", () => {
    expect(
      isPrismaPostgresUrl(
        "postgres://user:pass@db.prisma.io:5432/postgres?sslmode=require",
      ),
    ).toBe(true);
    expect(
      isPrismaPostgresUrl(
        "postgres://user:pass@pooled.db.prisma.io:5432/postgres?sslmode=require",
      ),
    ).toBe(true);
    expect(
      isPrismaPostgresUrl(
        "postgresql://freshmint:freshmint@127.0.0.1:5433/freshmint",
      ),
    ).toBe(false);
  });

  it("rewrites direct Prisma Postgres TCP to pooled hostname", () => {
    expect(
      preferPooledPrismaUrl(
        "postgres://user:pass@db.prisma.io:5432/postgres?sslmode=require",
      ),
    ).toBe(
      "postgres://user:pass@pooled.db.prisma.io:5432/postgres?sslmode=require",
    );
    expect(
      preferPooledPrismaUrl(
        "postgresql://freshmint:freshmint@127.0.0.1:5433/freshmint",
      ),
    ).toBe("postgresql://freshmint:freshmint@127.0.0.1:5433/freshmint");
  });
});
