/**
 * Backfill Collection.slug for rows where slug IS NULL.
 * Derives URL-safe slugs from title; never overwrites non-null slugs.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/backfill-collection-slugs.mjs
 *   DRY_RUN=1 DATABASE_URL=... node scripts/backfill-collection-slugs.mjs
 */
import pg from "pg";

const COLLECTION_SLUG_MIN = 3;
const COLLECTION_SLUG_MAX = 48;
const RESERVED = new Set([
  "new",
  "api",
  "mine",
  "create",
  "edit",
  "admin",
  "slug",
  "check",
]);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

function normalizeCollectionSlug(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, COLLECTION_SLUG_MAX)
    .replace(/-+$/g, "");
}

function allocateUniqueCollectionSlug(title, taken, fallbackSeed) {
  let base = normalizeCollectionSlug(title);
  if (!base || base.length < COLLECTION_SLUG_MIN || RESERVED.has(base)) {
    base = normalizeCollectionSlug(fallbackSeed || "collection") || "collection";
    if (base.length < COLLECTION_SLUG_MIN) {
      base = `col-${base}`.slice(0, COLLECTION_SLUG_MAX);
    }
    if (RESERVED.has(base)) {
      base = `col-${base}`.slice(0, COLLECTION_SLUG_MAX);
    }
  }

  const isFree = (candidate) =>
    Boolean(candidate) &&
    candidate.length >= COLLECTION_SLUG_MIN &&
    candidate.length <= COLLECTION_SLUG_MAX &&
    SLUG_RE.test(candidate) &&
    !RESERVED.has(candidate) &&
    !taken.has(candidate);

  if (isFree(base)) return base;
  for (let n = 2; n < 10_000; n += 1) {
    const suffix = `-${n}`;
    const truncated = base.slice(
      0,
      Math.max(1, COLLECTION_SLUG_MAX - suffix.length),
    );
    const candidate = `${truncated}${suffix}`.replace(/-+$/g, "");
    if (isFree(candidate)) return candidate;
  }
  throw new Error("unable_to_allocate_collection_slug");
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes("sslmode=")
    ? { rejectUnauthorized: false }
    : undefined,
});

await client.connect();

try {
  const existing = await client.query(
    `SELECT id, title, slug FROM "Collection" ORDER BY "createdAt" ASC, id ASC`,
  );
  const taken = new Set(
    existing.rows
      .map((r) => (r.slug ? String(r.slug).trim().toLowerCase() : ""))
      .filter(Boolean),
  );
  const nullRows = existing.rows.filter((r) => r.slug == null || r.slug === "");
  console.log(
    JSON.stringify(
      {
        dryRun,
        total: existing.rows.length,
        alreadySlugged: existing.rows.length - nullRows.length,
        toBackfill: nullRows.length,
      },
      null,
      2,
    ),
  );

  const updates = [];
  for (const row of nullRows) {
    const slug = allocateUniqueCollectionSlug(row.title, taken, row.id);
    taken.add(slug);
    updates.push({ id: row.id, title: row.title, slug });
  }

  if (!updates.length) {
    console.log("No null slugs to backfill.");
    process.exit(0);
  }

  console.log("Planned updates:");
  for (const u of updates) {
    console.log(`  ${u.id}  "${u.title}" -> ${u.slug}`);
  }

  if (dryRun) {
    console.log("DRY_RUN=1 — no writes.");
    process.exit(0);
  }

  await client.query("BEGIN");
  for (const u of updates) {
    const res = await client.query(
      `UPDATE "Collection" SET slug = $1 WHERE id = $2 AND slug IS NULL RETURNING id, slug`,
      [u.slug, u.id],
    );
    if (res.rowCount !== 1) {
      throw new Error(`failed_update:${u.id}`);
    }
  }
  await client.query("COMMIT");

  const remaining = await client.query(
    `SELECT COUNT(*)::int AS null_slug FROM "Collection" WHERE slug IS NULL`,
  );
  console.log(
    JSON.stringify(
      {
        backfilled: updates.length,
        remainingNull: remaining.rows[0].null_slug,
        examples: updates.slice(0, 8),
      },
      null,
      2,
    ),
  );
} catch (err) {
  try {
    await client.query("ROLLBACK");
  } catch {
    /* ignore */
  }
  console.error(err);
  process.exit(1);
} finally {
  await client.end();
}
