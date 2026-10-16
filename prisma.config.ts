import "dotenv/config";
import { defineConfig } from "prisma/config";

// Neon (Vercel Storage `freshmint-pg`, STORAGE_* prefix) takes precedence over the
// legacy Prisma Postgres DATABASE_URL. Migrations use the direct (unpooled) host.
const migrationUrl =
  process.env.STORAGE_DATABASE_URL_UNPOOLED?.trim() ||
  process.env.STORAGE_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  "";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: migrationUrl,
  },
});
