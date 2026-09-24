-- Collection createdAt for "new this week" browse + volume aggregate indexes

ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill from earliest listing in the collection when available
UPDATE "Collection" c
SET "createdAt" = sub.min_created
FROM (
  SELECT "collectionId", MIN("createdAt") AS min_created
  FROM "Listing"
  WHERE "collectionId" IS NOT NULL
  GROUP BY "collectionId"
) AS sub
WHERE c."id" = sub."collectionId";

CREATE INDEX IF NOT EXISTS "Collection_createdAt_idx" ON "Collection"("createdAt");
CREATE INDEX IF NOT EXISTS "Listing_collectionId_idx" ON "Listing"("collectionId");
CREATE INDEX IF NOT EXISTS "Purchase_status_listingId_idx" ON "Purchase"("status", "listingId");
