/**
 * Run `prisma migrate deploy` with backoff.
 * Prisma Postgres (`db.prisma.io`) gives the `prisma_migration` role a tiny
 * connection budget; overlapping Vercel builds hit "too many connections".
 */
import { spawn } from "node:child_process";
import path from "node:path";

const ATTEMPTS = 6;
const prismaBin = path.join(process.cwd(), "node_modules", ".bin", "prisma");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function migrateDeploy() {
  return new Promise((resolve, reject) => {
    const child = spawn(prismaBin, ["migrate", "deploy"], {
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  const code = await migrateDeploy();
  if (code === 0) {
    process.exit(0);
  }
  if (attempt === ATTEMPTS) {
    console.error(`prisma migrate deploy failed after ${ATTEMPTS} attempts`);
    process.exit(code);
  }
  const waitMs = Math.min(45_000, 3_000 * 2 ** (attempt - 1));
  console.error(
    `prisma migrate deploy failed (attempt ${attempt}/${ATTEMPTS}); retrying in ${waitMs / 1000}s...`,
  );
  await sleep(waitMs);
}
