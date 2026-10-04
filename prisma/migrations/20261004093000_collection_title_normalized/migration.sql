-- Global case-insensitive collection name uniqueness.
-- Policy: titleNormalized = lower(trim + collapse whitespace of title).
-- Safe for prod: if case-insensitive duplicates already exist, this migration
-- FAILS with a clear exception listing sample groups — it does not rename or
-- delete rows. Resolve conflicts manually, then re-run migrate deploy.

-- AlterTable
ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS "titleNormalized" TEXT;

-- Backfill (matches src/lib/marketplace/collection-title.ts normalizeCollectionTitle)
UPDATE "Collection"
SET "titleNormalized" = lower(btrim(regexp_replace("title", '\s+', ' ', 'g')))
WHERE "titleNormalized" IS NULL;

-- Fail safely when duplicates would violate the unique index
DO $$
DECLARE
  dup_count integer;
  dup_sample text;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT 1
    FROM "Collection"
    WHERE "titleNormalized" IS NOT NULL
    GROUP BY "titleNormalized"
    HAVING COUNT(*) > 1
  ) d;

  IF dup_count > 0 THEN
    SELECT string_agg(fmt, E'\n') INTO dup_sample FROM (
      SELECT format(
        '  "%s" (%s rows): %s',
        "titleNormalized",
        COUNT(*),
        string_agg(id, ', ' ORDER BY "createdAt" NULLS LAST, id)
      ) AS fmt
      FROM "Collection"
      WHERE "titleNormalized" IS NOT NULL
      GROUP BY "titleNormalized"
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, "titleNormalized"
      LIMIT 20
    ) s;

    RAISE EXCEPTION
      'collection_title_unique_blocked: % case-insensitive duplicate title group(s) exist. Rename conflicting Collection.title rows (keep one owner of each name), then re-run migrate. Samples:%',
      dup_count,
      E'\n' || coalesce(dup_sample, '(none)');
  END IF;
END $$;

-- Require value after successful backfill
ALTER TABLE "Collection" ALTER COLUMN "titleNormalized" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Collection_titleNormalized_key" ON "Collection"("titleNormalized");
