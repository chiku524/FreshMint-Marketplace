-- Additive. Safe on the fresh (empty) database; on a database that already has
-- duplicate (collectionId, mediaHash) listings the unique index would fail.

-- One listing per media fingerprint per collection (NULL collectionId rows,
-- e.g. resale/single listings, are not constrained).
CREATE UNIQUE INDEX IF NOT EXISTS "Listing_collectionId_mediaHash_key" ON "Listing"("collectionId", "mediaHash");

-- Collection storage-quota ledger keyed by content hash (retries count once).
CREATE TABLE IF NOT EXISTS "CollectionMediaReservation" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "mediaHash" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollectionMediaReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CollectionMediaReservation_collectionId_mediaHash_key" ON "CollectionMediaReservation"("collectionId", "mediaHash");

DO $$ BEGIN
  ALTER TABLE "CollectionMediaReservation" ADD CONSTRAINT "CollectionMediaReservation_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;