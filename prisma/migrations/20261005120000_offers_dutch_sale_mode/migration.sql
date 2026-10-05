-- Offers (make / accept) for Buy-now style listings
CREATE TABLE IF NOT EXISTS "Offer" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "offererId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Offer_listingId_status_createdAt_idx" ON "Offer"("listingId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Offer_offererId_idx" ON "Offer"("offererId");
CREATE INDEX IF NOT EXISTS "Offer_createdAt_idx" ON "Offer"("createdAt");

DO $$ BEGIN
  ALTER TABLE "Offer" ADD CONSTRAINT "Offer_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Offer" ADD CONSTRAINT "Offer_offererId_fkey"
    FOREIGN KEY ("offererId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
