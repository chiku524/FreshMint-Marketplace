/**
 * Build-time `prisma migrate deploy` with guard rails.
 *
 * - Skips on Vercel Preview (shared prod DATABASE_URL) unless MIGRATE_ON_PREVIEW=1,
 *   when DATABASE_URL is unset, or when SKIP_DB_MIGRATE=1. See migrate-policy.mjs.
 * - Retries with backoff for transient errors: Prisma Postgres (`db.prisma.io`)
 *   gives the `prisma_migration` role a tiny connection budget, so overlapping
 *   builds can hit "too many connections".
 * - Fails fast with a clear message on errors retrying can't fix
 *   (e.g. P1001 can't reach database server), so production never ships
 *   against an unmigrated database.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { migratePolicy, nonRetryableCode } from "./migrate-policy.mjs";

const ATTEMPTS = 6;
const prismaBin = path.join(process.cwd(), "node_modules", ".bin", "prisma");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function migrateDeploy() {
  return new Promise((resolve, reject) => {
    let output = "";
    const child = spawn(prismaBin, ["migrate", "deploy"], {
      stdio: ["inherit", "pipe", "pipe"],
      env: process.env,
      shell: process.platform === "win32",
    });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

const policy = migratePolicy(process.env);
if (!policy.run) {
  console.log(`[migrate-deploy] skipping prisma migrate deploy: ${policy.reason}`);
  process.exit(0);
}
console.log(`[migrate-deploy] running prisma migrate deploy (${policy.reason})`);

for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  const { code, output } = await migrateDeploy();
  if (code === 0) {
    process.exit(0);
  }
  const fatal = nonRetryableCode(output);
  if (fatal) {
    console.error(
      `[migrate-deploy] ${fatal}: not retrying. The database in DATABASE_URL is unreachable or rejected the ` +
        "connection. Check the Postgres store (Vercel \u2192 Storage) is active and connected to this project, " +
        "and that DATABASE_URL for this environment is current. Set SKIP_DB_MIGRATE=1 only if you " +
        "intentionally want to build without migrating.",
    );
    process.exit(code);
  }
  if (attempt === ATTEMPTS) {
    console.error(`[migrate-deploy] prisma migrate deploy failed after ${ATTEMPTS} attempts`);
    process.exit(code);
  }
  const waitMs = Math.min(45_000, 3_000 * 2 ** (attempt - 1));
  console.error(
    `[migrate-deploy] failed (attempt ${attempt}/${ATTEMPTS}); retrying in ${waitMs / 1000}s...`,
  );
  await sleep(waitMs);
}